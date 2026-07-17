import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => clampPositiveInt(value), { toClassOnly: true })
  @IsInt()
  @Min(0)
  offset?: number;
}
