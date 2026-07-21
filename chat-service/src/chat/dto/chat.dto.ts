import { Transform } from 'class-transformer'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator'

function clampPositiveInt(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return undefined
  }
  return Math.floor(numberValue)
}

export class MessagesQueryDto {
  @IsOptional()
  @Transform(({ value }) => clampPositiveInt(value), { toClassOnly: true })
  @IsInt()
  @Min(0)
  @Max(100)
  limit?: number

  @IsOptional()
  @Transform(({ value }) => clampPositiveInt(value), { toClassOnly: true })
  @IsInt()
  @Min(0)
  offset?: number
}

export class JoinRoomDto {
  @IsUUID()
  channelId!: string
}

export class SendMessageDto {
  @IsUUID()
  channelId!: string

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  message?: string

  @IsString()
  @IsOptional()
  imageUrl?: string

  @IsUUID()
  @IsOptional()
  parentMessageId?: string

  @IsOptional()
  isForwarded?: boolean
}

export class DirectChannelDto {
  @IsUUID()
  peerId!: string
}

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberIds!: string[]

  @IsString()
  @IsOptional()
  avatarUrl?: string
}
