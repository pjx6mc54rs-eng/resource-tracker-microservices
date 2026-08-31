import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitMeetings1784150000000 implements MigrationInterface {
  name = 'InitMeetings1784150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "meetings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "title" character varying(200) NOT NULL,
      "description" text,
      "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "organizer_id" uuid NOT NULL,
      "project_id" uuid,
      "channel_id" uuid,
      "status" character varying(20) NOT NULL DEFAULT 'SCHEDULED',
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_meetings" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_meetings_starts_at" ON "meetings" ("starts_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_meetings_organizer_starts" ON "meetings" ("organizer_id", "starts_at")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "meeting_participants" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "meeting_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "response" character varying(20) NOT NULL DEFAULT 'PENDING',
      "responded_at" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_meeting_participants" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_meeting_participant" UNIQUE ("meeting_id", "user_id")
    )`);
    await queryRunner.query(
      `ALTER TABLE "meeting_participants" DROP CONSTRAINT IF EXISTS "FK_meeting_participants_meeting"`,
    );
    await queryRunner.query(`ALTER TABLE "meeting_participants"
      ADD CONSTRAINT "FK_meeting_participants_meeting"
      FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE`);
    // Requete dominante : « mes reunions », donc un acces par utilisateur.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_meeting_participants_user" ON "meeting_participants" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "meeting_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meetings"`);
  }
}
