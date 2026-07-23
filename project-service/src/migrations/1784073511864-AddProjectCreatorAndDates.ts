import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectCreatorAndDates1784073511864 implements MigrationInterface {
  name = 'AddProjectCreatorAndDates1784073511864';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT IF EXISTS "FK_task_assignments_task"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_task_assignments_task_user"`,
    );
    await queryRunner.query(`ALTER TABLE "projects" ADD "created_by" uuid`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `UPDATE "projects" SET "created_by" = '9141c4ad-f87a-43ea-906f-6294975ca3a7' WHERE "created_by" IS NULL`,
    );
    // Ignoré car l'index UNIQUE existe déjà depuis InitSchema
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT IF EXISTS "FK_b389f4488d0a8241c3c98273966"`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT IF EXISTS "IDX_task_assignments_task_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN IF EXISTS "created_by"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_task_assignments_task_user" ON "task_assignments" ("task_id", "user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" ADD CONSTRAINT "FK_task_assignments_task" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
