import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserDepartment1783873838412 implements MigrationInterface {
  name = 'DropUserDepartment1783873838412';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "department"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "department" character varying`,
    );
  }
}
