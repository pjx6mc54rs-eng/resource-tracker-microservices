import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddImageUrlToChatMessages1784110000000 implements MigrationInterface {
  name = 'AddImageUrlToChatMessages1784110000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" ADD COLUMN "image_url" character varying')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" DROP COLUMN "image_url"')
  }
}
