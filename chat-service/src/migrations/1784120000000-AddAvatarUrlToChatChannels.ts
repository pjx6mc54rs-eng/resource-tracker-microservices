import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAvatarUrlToChatChannels1784120000000 implements MigrationInterface {
  name = 'AddAvatarUrlToChatChannels1784120000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_channels" ADD COLUMN "avatar_url" character varying')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_channels" DROP COLUMN "avatar_url"')
  }
}
