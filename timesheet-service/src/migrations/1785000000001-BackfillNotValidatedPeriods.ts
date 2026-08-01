import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Months logged before the validation workflow existed have no period row, so
 * they were only *implicitly* unvalidated. Give every one of them an explicit
 * `not_validated` row, and rename the former `draft` default to match.
 */
export class BackfillNotValidatedPeriods1785000000001 implements MigrationInterface {
    name = 'BackfillNotValidatedPeriods1785000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rows written while the initial state was still called "draft".
        await queryRunner.query(`UPDATE "timesheet_periods" SET "status" = 'not_validated' WHERE "status" = 'draft'`);
        await queryRunner.query(`ALTER TABLE "timesheet_periods" ALTER COLUMN "status" SET DEFAULT 'not_validated'`);

        // One row per (collaborateur, month) that already has entries.
        // ON CONFLICT keeps any month whose validation has already started.
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.timesheets') IS NOT NULL THEN
                    INSERT INTO "timesheet_periods"
                        ("id", "user_id", "year", "month", "status", "created_at", "updated_at")
                    SELECT
                        gen_random_uuid(),
                        t."user_id",
                        EXTRACT(YEAR FROM t."date")::int,
                        EXTRACT(MONTH FROM t."date")::int,
                        'not_validated',
                        now(),
                        now()
                    FROM "timesheets" t
                    GROUP BY t."user_id", EXTRACT(YEAR FROM t."date"), EXTRACT(MONTH FROM t."date")
                    ON CONFLICT ("user_id", "year", "month") DO NOTHING;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Only the untouched rows can have come from the backfill; anything
        // submitted or reviewed since then is real workflow state and stays.
        await queryRunner.query(`DELETE FROM "timesheet_periods"
            WHERE "status" = 'not_validated'
              AND "submitted_at" IS NULL
              AND "reviewed_at" IS NULL`);
        await queryRunner.query(`UPDATE "timesheet_periods" SET "status" = 'draft' WHERE "status" = 'not_validated'`);
        await queryRunner.query(`ALTER TABLE "timesheet_periods" ALTER COLUMN "status" SET DEFAULT 'draft'`);
    }
}
