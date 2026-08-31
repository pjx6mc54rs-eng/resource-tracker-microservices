import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Meeting, MeetingStatus } from '../entities/meeting.entity';
import {
  MeetingParticipant,
  ParticipantResponse,
} from '../entities/meeting-participant.entity';
import { EventsService } from '../events/events.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RespondDto } from './dto/respond.dto';

/** Duree minimale d'une reunion, en minutes. */
const MIN_DURATION_MINUTES = 5;
/** Duree maximale, garde-fou contre une saisie erronee de date de fin. */
const MAX_DURATION_HOURS = 12;

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingParticipant)
    private readonly participants: Repository<MeetingParticipant>,
    private readonly events: EventsService,
  ) {}

  // ------------------------------------------------------------- lecture

  /** Reunions auxquelles l'utilisateur participe ou qu'il organise. */
  async findForUser(
    userId: string,
    options: { from?: Date; to?: Date; includeCancelled?: boolean } = {},
  ) {
    const query = this.meetings
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      // Le filtre porte sur une sous-requete : joindre directement sur
      // participant.user_id ne renverrait que l'invitation de l'appelant et
      // masquerait les autres participants de la reunion.
      .where(
        `(meeting.organizer_id = :userId OR EXISTS (
            SELECT 1 FROM meeting_participants p
            WHERE p.meeting_id = meeting.id AND p.user_id = :userId))`,
        { userId },
      )
      .orderBy('meeting.starts_at', 'ASC');

    if (!options.includeCancelled) {
      query.andWhere('meeting.status != :cancelled', {
        cancelled: MeetingStatus.CANCELLED,
      });
    }
    if (options.from) {
      query.andWhere('meeting.ends_at >= :from', { from: options.from });
    }
    if (options.to) {
      query.andWhere('meeting.starts_at <= :to', { to: options.to });
    }

    return query.getMany();
  }

  async findOneForUser(id: string, userId: string) {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException('Réunion introuvable');
    this.assertVisible(meeting, userId);
    return meeting;
  }

  // ------------------------------------------------------------- ecriture

  async create(dto: CreateMeetingDto, organizerId: string) {
    const { startsAt, endsAt } = this.parseSlot(dto.startsAt, dto.endsAt);

    // L'organisateur est toujours participant, et compte comme ayant accepte :
    // il serait absurde qu'il doive repondre a sa propre invitation.
    const invitedIds = Array.from(
      new Set([...(dto.participantIds ?? []), organizerId]),
    );
    if (invitedIds.length < 2) {
      throw new BadRequestException('Invitez au moins un participant');
    }

    const meeting = await this.meetings.save(
      this.meetings.create({
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startsAt,
        endsAt,
        organizerId,
        projectId: dto.projectId ?? null,
        status: MeetingStatus.SCHEDULED,
      }),
    );

    await this.participants.save(
      invitedIds.map((userId) =>
        this.participants.create({
          meetingId: meeting.id,
          userId,
          response:
            userId === organizerId
              ? ParticipantResponse.ACCEPTED
              : ParticipantResponse.PENDING,
          respondedAt: userId === organizerId ? new Date() : null,
        }),
      ),
    );

    this.events.emit('meeting.invited', {
      recipientIds: invitedIds.filter((id) => id !== organizerId),
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      organizerId,
    });

    return this.findOneWithParticipants(meeting.id);
  }

  async update(id: string, dto: UpdateMeetingDto, userId: string) {
    const meeting = await this.findOneWithParticipants(id);
    this.assertOrganizer(meeting, userId);
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('Cette réunion est annulée');
    }

    const slotChanged = dto.startsAt !== undefined || dto.endsAt !== undefined;
    if (slotChanged) {
      const { startsAt, endsAt } = this.parseSlot(
        dto.startsAt ?? meeting.startsAt.toISOString(),
        dto.endsAt ?? meeting.endsAt.toISOString(),
      );
      meeting.startsAt = startsAt;
      meeting.endsAt = endsAt;
    }
    if (dto.title !== undefined) meeting.title = dto.title.trim();
    if (dto.description !== undefined) {
      meeting.description = dto.description?.trim() || null;
    }
    if (dto.projectId !== undefined) meeting.projectId = dto.projectId ?? null;

    await this.meetings.save(meeting);

    // Un changement de creneau invalide les reponses deja donnees : chacun doit
    // se prononcer sur le nouvel horaire, faute de quoi l'organisateur croirait
    // a tort que tout le monde est disponible.
    if (slotChanged) {
      await this.participants.update(
        { meetingId: id, userId: Not(meeting.organizerId) },
        { response: ParticipantResponse.PENDING, respondedAt: null },
      );
    }

    const recipientIds = (meeting.participants ?? [])
      .map((p) => p.userId)
      .filter((pid) => pid !== userId);

    this.events.emit('meeting.updated', {
      recipientIds,
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      slotChanged,
      actorId: userId,
    });

    return this.findOneWithParticipants(id);
  }

  async cancel(id: string, userId: string) {
    const meeting = await this.findOneWithParticipants(id);
    this.assertOrganizer(meeting, userId);
    if (meeting.status === MeetingStatus.CANCELLED) return meeting;

    meeting.status = MeetingStatus.CANCELLED;
    await this.meetings.save(meeting);

    this.events.emit('meeting.cancelled', {
      recipientIds: (meeting.participants ?? [])
        .map((p) => p.userId)
        .filter((pid) => pid !== userId),
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      actorId: userId,
    });

    return meeting;
  }

  async respond(id: string, dto: RespondDto, userId: string) {
    const meeting = await this.findOneWithParticipants(id);
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('Cette réunion est annulée');
    }
    const participant = (meeting.participants ?? []).find(
      (p) => p.userId === userId,
    );
    if (!participant) {
      throw new ForbiddenException("Vous n'êtes pas invité à cette réunion");
    }

    participant.response = dto.response;
    participant.respondedAt = new Date();
    await this.participants.save(participant);

    // Seul l'organisateur est notifie : inonder tous les invites a chaque
    // reponse rendrait le centre de notifications illisible.
    if (userId !== meeting.organizerId) {
      this.events.emit('meeting.response', {
        recipientIds: [meeting.organizerId],
        meetingId: meeting.id,
        title: meeting.title,
        response: dto.response,
        actorId: userId,
      });
    }

    return this.findOneWithParticipants(id);
  }

  /**
   * Memorise le canal de discussion ouvert pour une reunion a plus de deux
   * participants, afin que les connexions suivantes le reutilisent.
   */
  async attachChannel(id: string, channelId: string, userId: string) {
    const meeting = await this.findOneWithParticipants(id);
    this.assertVisible(meeting, userId);
    if (!meeting.channelId) {
      meeting.channelId = channelId;
      await this.meetings.save(meeting);
    }
    return meeting;
  }

  // ------------------------------------------------------------ conflits

  /**
   * Reunions deja programmees qui chevauchent le creneau demande, pour les
   * participants indiques. Deux reunions se chevauchent si chacune commence
   * avant la fin de l'autre.
   */
  async findConflicts(
    startsAtRaw: string,
    endsAtRaw: string,
    userIds: string[],
    excludeMeetingId?: string,
  ) {
    const { startsAt, endsAt } = this.parseSlot(startsAtRaw, endsAtRaw);
    if (userIds.length === 0) return [];

    const query = this.meetings
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      .where('meeting.status != :cancelled', {
        cancelled: MeetingStatus.CANCELLED,
      })
      .andWhere('meeting.starts_at < :endsAt', { endsAt })
      .andWhere('meeting.ends_at > :startsAt', { startsAt })
      .andWhere(
        `EXISTS (SELECT 1 FROM meeting_participants p
                 WHERE p.meeting_id = meeting.id AND p.user_id IN (:...userIds))`,
        { userIds },
      );

    if (excludeMeetingId) {
      query.andWhere('meeting.id != :excludeMeetingId', { excludeMeetingId });
    }

    return query.orderBy('meeting.starts_at', 'ASC').getMany();
  }

  // ------------------------------------------------------------- helpers

  private async findOneWithParticipants(id: string) {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException('Réunion introuvable');
    return meeting;
  }

  private assertOrganizer(meeting: Meeting, userId: string) {
    if (meeting.organizerId !== userId) {
      throw new ForbiddenException(
        "Seul l'organisateur peut modifier cette réunion",
      );
    }
  }

  private assertVisible(meeting: Meeting, userId: string) {
    const isParticipant = (meeting.participants ?? []).some(
      (p) => p.userId === userId,
    );
    if (meeting.organizerId !== userId && !isParticipant) {
      throw new ForbiddenException('Accès refusé à cette réunion');
    }
  }

  private parseSlot(startsAtRaw: string, endsAtRaw: string) {
    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Dates invalides');
    }
    const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
    if (minutes < MIN_DURATION_MINUTES) {
      throw new BadRequestException(
        `La réunion doit durer au moins ${MIN_DURATION_MINUTES} minutes`,
      );
    }
    if (minutes > MAX_DURATION_HOURS * 60) {
      throw new BadRequestException(
        `La réunion ne peut pas dépasser ${MAX_DURATION_HOURS} heures`,
      );
    }
    return { startsAt, endsAt };
  }
}
