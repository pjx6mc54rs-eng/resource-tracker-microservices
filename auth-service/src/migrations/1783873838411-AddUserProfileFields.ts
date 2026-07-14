import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1783873838411 implements MigrationInterface {
  name = 'AddUserProfileFields1783873838411';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "first_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "last_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "phone" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "job_title" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "bio" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "avatar_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bio"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "job_title"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "first_name"`);
  }
}
