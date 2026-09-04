import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { Meeting, MeetingStatus } from '../entities/meeting.entity';

export interface BusySlot {
  start: string;
  end: string;
  meetingId: string;
  /** Renseigné uniquement si l'appelant participe aussi à cette réunion. */
  title: string | null;
}

export interface UserAvailability {
  userId: string;
  busy: BusySlot[];
  /** Jours de congé ou fériés déclarés, au format AAAA-MM-JJ. */
  absences: string[];
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    private readonly http: HttpService,
  ) {}

  /**
   * Occupation de chaque utilisateur sur une plage, pour choisir un créneau
   * en connaissance de cause plutôt que d'être averti après coup.
   */
  async getAvailability(
    userIds: string[],
    from: Date,
    to: Date,
    requesterId: string,
  ): Promise<UserAvailability[]> {
    if (userIds.length === 0) return [];

    const meetings = await this.meetings
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      .where('meeting.status != :cancelled', {
        cancelled: MeetingStatus.CANCELLED,
      })
      // Chevauchement : la réunion commence avant la fin de la plage et se
      // termine après son début.
      .andWhere('meeting.starts_at < :to', { to })
      .andWhere('meeting.ends_at > :from', { from })
      .andWhere(
        `EXISTS (SELECT 1 FROM meeting_participants p
                 WHERE p.meeting_id = meeting.id AND p.user_id IN (:...userIds))`,
        { userIds },
      )
      .orderBy('meeting.starts_at', 'ASC')
      .getMany();

    const absencesByUser = await this.fetchAbsences(userIds, from, to, requesterId);

    return userIds.map((userId) => {
      const busy = meetings
        .filter((meeting) =>
          (meeting.participants ?? []).some((p) => p.userId === userId),
        )
        .map((meeting) => {
          // CONFIDENTIALITE : l'intitulé d'une réunion peut être sensible
          // (« entretien annuel », « point RH »). L'organisateur a besoin de
          // savoir que le créneau est pris, pas de savoir pourquoi. Le titre
          // n'est donc renvoyé que si l'appelant participe lui aussi.
          const requesterIsIn = (meeting.participants ?? []).some(
            (p) => p.userId === requesterId,
          );
          return {
            start: meeting.startsAt.toISOString(),
            end: meeting.endsAt.toISOString(),
            meetingId: meeting.id,
            title: requesterIsIn ? meeting.title : null,
          };
        });

      return { userId, busy, absences: absencesByUser.get(userId) ?? [] };
    });
  }

  /**
   * Absences déclarées, lues auprès de timesheet-service.
   *
   * Dégradation gracieuse : si le service est indisponible ou n'expose pas
   * encore cette route, la disponibilité reste calculée sur les seules
   * réunions. Mieux vaut une information partielle qu'un formulaire en erreur.
   */
  private async fetchAbsences(
    userIds: string[],
    from: Date,
    to: Date,
    requesterId: string,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    const baseUrl = process.env.TIMESHEET_SERVICE_URL;
    if (!baseUrl) return result;

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const url = `${baseUrl}/timesheets/absences`;

    try {
      const response = await firstValueFrom(
        this.http.get<{ userId: string; date: string }[]>(url, {
          params: { userIds: userIds.join(','), from: day(from), to: day(to) },
          // timesheet-service lit l'identite dans x-user-id, en-tete que la
          // passerelle injecte apres verification du jeton. Un appel interne
          // doit donc la propager : un Authorization ne serait pas lu.
          headers: { 'x-user-id': requesterId },
          timeout: 4000,
        }),
      );
      for (const row of response.data ?? []) {
        const list = result.get(row.userId) ?? [];
        list.push(row.date);
        result.set(row.userId, list);
      }
    } catch (err) {
      this.logger.warn(
        `Absences indisponibles, disponibilité calculée sans elles : ${
          (err as Error)?.message
        }`,
      );
    }
    return result;
  }
}
