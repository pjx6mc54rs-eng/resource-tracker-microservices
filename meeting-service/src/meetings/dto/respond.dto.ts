import { IsEnum } from 'class-validator';
import { ParticipantResponse } from '../../entities/meeting-participant.entity';

export class RespondDto {
  @IsEnum(ParticipantResponse)
  response: ParticipantResponse;
}
