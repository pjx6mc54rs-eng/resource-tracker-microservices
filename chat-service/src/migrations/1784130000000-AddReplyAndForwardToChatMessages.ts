import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddReplyAndForwardToChatMessages1784130000000 implements MigrationInterface {
  name = 'AddReplyAndForwardToChatMessages1784130000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" ADD COLUMN "parent_message_id" uuid')
    await queryRunner.query('ALTER TABLE "chat_messages" ADD COLUMN "is_forwarded" boolean DEFAULT false')
    await queryRunner.query('ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_chat_messages_parent" FOREIGN KEY ("parent_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_chat_messages_parent"')
    await queryRunner.query('ALTER TABLE "chat_messages" DROP COLUMN "parent_message_id"')
    await queryRunner.query('ALTER TABLE "chat_messages" DROP COLUMN "is_forwarded"')
  }
}
