import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCalls1784140000000 implements MigrationInterface {
  name = 'AddCalls1784140000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "calls_type_enum" AS ENUM('AUDIO', 'VIDEO');
    EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "calls_status_enum" AS ENUM('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED');
    EXCEPTION WHEN duplicate_object THEN null; END $$`)

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "calls" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "channel_id" uuid NOT NULL,
      "initiator_id" uuid NOT NULL,
      "type" "calls_type_enum" NOT NULL DEFAULT 'AUDIO',
      "status" "calls_status_enum" NOT NULL DEFAULT 'RINGING',
      "answered_at" TIMESTAMP WITH TIME ZONE,
      "ended_at" TIMESTAMP WITH TIME ZONE,
      "duration_seconds" integer NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_calls" PRIMARY KEY ("id")
    )`)
    await queryRunner.query(`ALTER TABLE "calls" DROP CONSTRAINT IF EXISTS "FK_calls_channel"`)
    await queryRunner.query(`ALTER TABLE "calls" ADD CONSTRAINT "FK_calls_channel"
      FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE`)
    // Requete dominante : l'historique d'un canal, du plus recent au plus ancien.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_calls_channel_created" ON "calls" ("channel_id", "created_at")`,
    )

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "call_participants" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "call_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "joined_at" TIMESTAMP WITH TIME ZONE,
      "left_at" TIMESTAMP WITH TIME ZONE,
      "muted" boolean NOT NULL DEFAULT false,
      "camera_off" boolean NOT NULL DEFAULT false,
      CONSTRAINT "PK_call_participants" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_call_participant" UNIQUE ("call_id", "user_id")
    )`)
    await queryRunner.query(`ALTER TABLE "call_participants" DROP CONSTRAINT IF EXISTS "FK_call_participants_call"`)
    await queryRunner.query(`ALTER TABLE "call_participants" ADD CONSTRAINT "FK_call_participants_call"
      FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "call_participants"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_calls_channel_created"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "calls"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "calls_status_enum"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "calls_type_enum"`)
  }
}
