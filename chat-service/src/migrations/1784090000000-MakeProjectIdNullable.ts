import { MigrationInterface, QueryRunner } from 'typeorm'

export class MakeProjectIdNullable1784090000000 implements MigrationInterface {
  name = 'MakeProjectIdNullable1784090000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" ALTER COLUMN "project_id" DROP NOT NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" ALTER COLUMN "project_id" SET NOT NULL')
  }
}
