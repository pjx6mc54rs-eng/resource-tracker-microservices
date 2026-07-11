import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783738719315 implements MigrationInterface {
    name = 'InitialSchema1783738719315'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "reporting_view" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "project_id" uuid NOT NULL, "total_hours" numeric(6,2) NOT NULL DEFAULT '0', "last_updated" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e626a580015eb4fee1601a318b4" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reporting_view"`);
    }

}
