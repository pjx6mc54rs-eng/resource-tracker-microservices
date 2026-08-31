import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RespondDto } from './dto/respond.dto';
import { requireUserId } from '../common/request-user';
import type { IncomingHeaders } from '../common/request-user';

/**
 * L'identite de l'appelant provient exclusivement des en-tetes injectees par
 * l'api-gateway apres verification du jeton. Ce service ne verifie donc pas de
 * signature : il n'est joignable que depuis le reseau interne du cluster.
 */
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** Reunions de l'appelant, filtrables par fenetre temporelle. */
  @Get('me')
  findMine(
    @Headers() headers: IncomingHeaders,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeCancelled') includeCancelled?: string,
  ) {
    const userId = requireUserId(headers);
    return this.meetings.findForUser(userId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      includeCancelled: includeCancelled === 'true',
    });
  }

  /**
   * Reunions qui chevauchent un creneau pour une liste de participants.
   * Consulte avant validation du formulaire, afin de signaler un conflit sans
   * bloquer : c'est a l'organisateur de trancher.
   */
  @Get('conflicts')
  findConflicts(
    @Headers() headers: IncomingHeaders,
    @Query('startsAt') startsAt: string,
    @Query('endsAt') endsAt: string,
    @Query('userIds') userIds?: string,
    @Query('exclude') exclude?: string,
  ) {
    requireUserId(headers);
    const ids = (userIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.meetings.findConflicts(startsAt, endsAt, ids, exclude);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Headers() headers: IncomingHeaders) {
    return this.meetings.findOneForUser(id, requireUserId(headers));
  }

  @Post()
  create(@Body() dto: CreateMeetingDto, @Headers() headers: IncomingHeaders) {
    return this.meetings.create(dto, requireUserId(headers));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Headers() headers: IncomingHeaders,
  ) {
    return this.meetings.update(id, dto, requireUserId(headers));
  }

  /** Annulation logique : la reunion reste dans l'historique. */
  @Delete(':id')
  cancel(@Param('id') id: string, @Headers() headers: IncomingHeaders) {
    return this.meetings.cancel(id, requireUserId(headers));
  }

  @Post(':id/response')
  respond(
    @Param('id') id: string,
    @Body() dto: RespondDto,
    @Headers() headers: IncomingHeaders,
  ) {
    return this.meetings.respond(id, dto, requireUserId(headers));
  }

  /** Enregistre le canal de discussion ouvert pour cette reunion. */
  @Patch(':id/channel')
  attachChannel(
    @Param('id') id: string,
    @Body() body: { channelId: string },
    @Headers() headers: IncomingHeaders,
  ) {
    return this.meetings.attachChannel(
      id,
      body?.channelId,
      requireUserId(headers),
    );
  }
}
