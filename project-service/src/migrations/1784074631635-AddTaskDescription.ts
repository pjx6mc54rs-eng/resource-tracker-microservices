import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTaskDescription1784074631635 implements MigrationInterface {
    name = 'AddTaskDescription1784074631635'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "description"`);
    }

}
