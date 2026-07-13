import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatchResultEmbeddingTrace1720000000000 implements MigrationInterface {
  name = 'AddMatchResultEmbeddingTrace1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE match_results ADD COLUMN IF NOT EXISTS embedding_trace JSONB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE match_results DROP COLUMN IF EXISTS embedding_trace`,
    );
  }
}
