import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskAssignmentsMultiUsers1783872815134 implements MigrationInterface {
  name = 'TaskAssignmentsMultiUsers1783872815134';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "task_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "task_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_task_assignments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_task_assignments_task_user"
      ON "task_assignments" ("task_id", "user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "task_assignments"
      ADD CONSTRAINT "FK_task_assignments_task"
      FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Migrer les anciennes assignations mono-collaborateur
    await queryRunner.query(`
      INSERT INTO "task_assignments" ("task_id", "user_id")
      SELECT "id", "assigned_user_id" FROM "tasks"
      WHERE "assigned_user_id" IS NOT NULL
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_tasks_project_assigned_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_tasks_assigned_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "assigned_user_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" ADD "assigned_user_id" uuid`);
    await queryRunner.query(`
      UPDATE "tasks" t
      SET "assigned_user_id" = (
        SELECT ta."user_id" FROM "task_assignments" ta
        WHERE ta."task_id" = t."id"
        LIMIT 1
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "tasks" ALTER COLUMN "assigned_user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_assigned_user_id" ON "tasks" ("assigned_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_project_assigned_user" ON "tasks" ("projectId", "assigned_user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignments" DROP CONSTRAINT "FK_task_assignments_task"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_task_assignments_task_user"`,
    );
    await queryRunner.query(`DROP TABLE "task_assignments"`);
  }
}
