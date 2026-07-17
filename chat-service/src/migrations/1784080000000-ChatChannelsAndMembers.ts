import { MigrationInterface, QueryRunner } from 'typeorm'

export class ChatChannelsAndMembers1784080000000 implements MigrationInterface {
  name = 'ChatChannelsAndMembers1784080000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await queryRunner.query(`DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'chat_channels_type_enum'
        ) THEN
          CREATE TYPE "public"."chat_channels_type_enum" AS ENUM('PROJECT', 'DIRECT', 'GROUP');
        END IF;
      END$$;
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_channels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "public"."chat_channels_type_enum" NOT NULL DEFAULT 'GROUP',
        "name" text,
        "project_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_channels" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_channel_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "last_read_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_channel_members" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel_id" uuid,
        "sender_id" uuid,
        "project_id" uuid,
        "message" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_channel_members_unique" ON "chat_channel_members" ("channel_id", "user_id")')
    await queryRunner.query(
      'ALTER TABLE "chat_channel_members" ADD CONSTRAINT "FK_chat_channel_members_channel" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    )
    await queryRunner.query('ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "channel_id" uuid')
    await queryRunner.query('ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "sender_id" uuid')
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_chat_messages_channel_created" ON "chat_messages" ("channel_id", "created_at")')
    await queryRunner.query(`DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_chat_messages_channel'
            AND table_schema = 'public'
            AND table_name = 'chat_messages'
        ) THEN
          ALTER TABLE "chat_messages"
          ADD CONSTRAINT "FK_chat_messages_channel"
          FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `)
    await queryRunner.query('UPDATE "chat_messages" SET "sender_id" = "user_id" WHERE "sender_id" IS NULL')
    await queryRunner.query(`
      INSERT INTO "chat_channels" ("id", "type", "name", "project_id")
      SELECT DISTINCT uuid_generate_v4(), 'PROJECT'::"public"."chat_channels_type_enum", 'Projet ' || "project_id", "project_id"
      FROM "chat_messages"
      WHERE "project_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "chat_channels" c WHERE c."project_id" = "chat_messages"."project_id"
      )
    `)
    await queryRunner.query(`
      INSERT INTO "chat_channel_members" ("channel_id", "user_id", "last_read_at")
      SELECT c.id, m.user_id, now()
      FROM "chat_channels" c
      JOIN "chat_messages" m ON m."project_id" = c."project_id"
      ON CONFLICT DO NOTHING
    `)
    await queryRunner.query(`
      UPDATE "chat_messages" m
      SET "channel_id" = c.id
      FROM "chat_channels" c
      WHERE m."project_id" = c."project_id"
    `)
    await queryRunner.query('ALTER TABLE "chat_messages" ALTER COLUMN "sender_id" SET NOT NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "FK_chat_messages_channel"')
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_chat_messages_channel_created"')
    await queryRunner.query('ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "channel_id"')
    await queryRunner.query('ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "sender_id"')
    await queryRunner.query('DROP TABLE IF EXISTS "chat_channel_members"')
    await queryRunner.query('DROP TABLE IF EXISTS "chat_channels"')
    await queryRunner.query('DROP TYPE IF EXISTS "public"."chat_channels_type_enum"')
  }
}
