import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783738697535 implements MigrationInterface {
    name = 'InitialSchema1783738697535'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "timesheets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "task_id" uuid NOT NULL, "date" date NOT NULL, "hours_spent" numeric(5,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1dc280b68c9353ecce41a34be71" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "timesheets"`);
    }

}
