import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssetsTable1789700000000 implements MigrationInterface {
  name = 'CreateAssetsTable1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."assets_type_enum" AS ENUM('MOTOR', 'PUMP', 'COMPRESSOR', 'FAN', 'OTHER')`);
    await queryRunner.query(`
      CREATE TABLE "assets" (
        "id" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "type" "public"."assets_type_enum" NOT NULL DEFAULT 'OTHER',
        "description" character varying,
        "user_id" character varying NOT NULL,
        "factory_id" character varying,
        "installed_at" TIMESTAMP,
        "expected_lifespan_months" integer,
        "health_index" integer,
        "health_status" character varying NOT NULL DEFAULT 'UNKNOWN',
        "health_assessed_at" TIMESTAMP,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_assets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_assets_user_id" ON "assets" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_assets_factory_id" ON "assets" ("factory_id")`);
    await queryRunner.query(
      `ALTER TABLE "assets" ADD CONSTRAINT "FK_assets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "devices" ADD "asset_id" character varying`);
    await queryRunner.query(`ALTER TABLE "devices" ADD "health_weight" real NOT NULL DEFAULT 1`);
    await queryRunner.query(`CREATE INDEX "IDX_devices_asset_id" ON "devices" ("asset_id")`);
    await queryRunner.query(
      `ALTER TABLE "devices" ADD CONSTRAINT "FK_devices_asset_id" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_devices_asset_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_devices_asset_id"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "health_weight"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "asset_id"`);

    await queryRunner.query(`ALTER TABLE "assets" DROP CONSTRAINT "FK_assets_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_assets_factory_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_assets_user_id"`);
    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`DROP TYPE "public"."assets_type_enum"`);
  }
}
