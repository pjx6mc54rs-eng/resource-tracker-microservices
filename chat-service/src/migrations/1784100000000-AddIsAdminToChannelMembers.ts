import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIsAdminToChannelMembers1784100000000 implements MigrationInterface {
  name = 'AddIsAdminToChannelMembers1784100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_channel_members" ADD COLUMN "is_admin" boolean DEFAULT false')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_channel_members" DROP COLUMN "is_admin"')
  }
}
