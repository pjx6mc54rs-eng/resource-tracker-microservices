import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  /** Sans l'organisateur : il est ajoute d'office. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  participantIds: string[];

  @IsOptional()
  @IsUUID()
  projectId?: string;
}
