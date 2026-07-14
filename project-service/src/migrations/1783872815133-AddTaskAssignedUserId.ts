import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskAssignedUserId1783872815133 implements MigrationInterface {
  name = 'AddTaskAssignedUserId1783872815133';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove orphan tasks that cannot be linked to a collaborator
    await queryRunner.query(`DELETE FROM "tasks"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "assigned_user_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_assigned_user_id" ON "tasks" ("assigned_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_project_assigned_user" ON "tasks" ("projectId", "assigned_user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_project_assigned_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_assigned_user_id"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN "assigned_user_id"`,
    );
  }
}
