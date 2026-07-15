import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class JoinProjectDto {
  @IsUUID()
  projectId!: string;
}

export class SendMessageDto extends JoinProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
