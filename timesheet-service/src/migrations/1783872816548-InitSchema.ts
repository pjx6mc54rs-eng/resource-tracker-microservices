import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783872816548 implements MigrationInterface {
    name = 'InitSchema1783872816548'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "timesheets" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(), 
            "user_id" uuid NOT NULL, 
            "project_id" uuid, 
            "task_id" uuid, 
            "date" date NOT NULL, 
            "hours_spent" numeric(5,2) NOT NULL DEFAULT 0, 
            "is_holiday" boolean NOT NULL DEFAULT false, 
            "note" text, 
            "created_at" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "PK_1dc280b68c9353ecce41a34be71" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "project_id" uuid;`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "is_holiday" boolean NOT NULL DEFAULT false;`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "note" text;`);
        await queryRunner.query(`ALTER TABLE "timesheets" ALTER COLUMN "task_id" DROP NOT NULL;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "timesheets"`);
    }
}
