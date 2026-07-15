import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  IsUUID,
} from 'class-validator';
import { TaskStatus } from '../../entities/task.entity';

export class UpdateTaskDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}
