import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { TaskStatus } from '../../entities/task.entity';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  title: string;

  /** Au moins un collaborateur obligatoire */
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Au moins un collaborateur doit être associé à la tâche',
  })
  @ArrayUnique()
  @IsUUID('4', { each: true })
  assignedUserIds: string[];

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
