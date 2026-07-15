import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectCreatorAndDates1784073511864 implements MigrationInterface {
  name = 'AddProjectCreatorAndDates1784073511864';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT "FK_task_assignments_task"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_task_assignments_task_user"`,
    );
    await queryRunner.query(`ALTER TABLE "projects" ADD "created_by" uuid`);
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `UPDATE "projects" SET "created_by" = '9141c4ad-f87a-43ea-906f-6294975ca3a7' WHERE "created_by" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "IDX_assignments_project_user" UNIQUE ("projectId", "user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" ADD CONSTRAINT "IDX_task_assignments_task_user" UNIQUE ("task_id", "user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" ADD CONSTRAINT "FK_b389f4488d0a8241c3c98273966" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT "FK_b389f4488d0a8241c3c98273966"`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT "IDX_task_assignments_task_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "IDX_assignments_project_user"`,
    );
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "created_by"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_task_assignments_task_user" ON "task_assignments" ("task_id", "user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" ADD CONSTRAINT "FK_task_assignments_task" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
