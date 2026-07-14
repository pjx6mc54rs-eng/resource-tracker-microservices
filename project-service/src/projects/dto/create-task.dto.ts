import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TaskStatus } from '../../entities/task.entity';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
