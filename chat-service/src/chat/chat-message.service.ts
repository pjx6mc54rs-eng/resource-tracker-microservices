import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity';
import { EncryptionService } from './encryption.service';

export type PublicChatMessage = {
  id: string;
  projectId: string;
  userId: string;
  message: string;
  createdAt: Date;
};

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    private readonly encryption: EncryptionService,
  ) {}

  async save(projectId: string, userId: string, message: string): Promise<PublicChatMessage> {
    const saved = await this.messages.save(
      this.messages.create({ projectId, userId, message: this.encryption.encrypt(message) }),
    );
    return { ...saved, message };
  }

  async getProjectMessages(projectId: string, limit: number, offset: number): Promise<PublicChatMessage[]> {
    const rows = await this.messages.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return rows.map((row) => ({ ...row, message: this.encryption.decrypt(row.message) })).reverse();
  }
}
