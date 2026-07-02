import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentContentHash1751442000000
  implements MigrationInterface
{
  name = 'AddDocumentContentHash1751442000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_documents_content_hash`,
    );
    await queryRunner.query(
      `ALTER TABLE documents DROP COLUMN IF EXISTS content_hash`,
    );
  }
}
