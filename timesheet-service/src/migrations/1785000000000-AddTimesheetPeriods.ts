import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTimesheetPeriods1785000000000 implements MigrationInterface {
    name = 'AddTimesheetPeriods1785000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "timesheet_periods" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "user_id" uuid NOT NULL,
            "year" integer NOT NULL,
            "month" integer NOT NULL,
            "status" character varying(20) NOT NULL DEFAULT 'not_validated',
            "submitted_at" TIMESTAMP,
            "reviewer_ids" text,
            "reviewed_by" uuid,
            "reviewed_at" TIMESTAMP,
            "review_comment" text,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_timesheet_periods" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_timesheet_periods_user_month"
            ON "timesheet_periods" ("user_id", "year", "month")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_timesheet_periods_status"
            ON "timesheet_periods" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timesheet_periods_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timesheet_periods_user_month"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "timesheet_periods"`);
    }
}
