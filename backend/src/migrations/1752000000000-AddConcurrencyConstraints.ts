import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConcurrencyConstraints1752000000000 implements MigrationInterface {
  name = 'AddConcurrencyConstraints1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. match_results:同一(resume, job)文档对只保留最新一条,防止并发计算产生重复行
    await queryRunner.query(`
      DELETE FROM match_results a
      USING match_results b
      WHERE a.resume_doc_id = b.resume_doc_id
        AND a.job_doc_id = b.job_doc_id
        AND a.created_at < b.created_at
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_match_results_pair
      ON match_results(resume_doc_id, job_doc_id)
    `);

    // 2. conversations:同一对用户(按 job 维度)只允许一个会话
    //    job_id 为 NULL 时普通唯一索引不生效(NULLS 互不相等),PG15+ 用 NULLS NOT DISTINCT
    await queryRunner.query(`
      DELETE FROM conversations a
      USING conversations b
      WHERE a.user_a_id = b.user_a_id
        AND a.user_b_id = b.user_b_id
        AND a.job_id IS NOT DISTINCT FROM b.job_id
        AND a.created_at < b.created_at
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_pair
      ON conversations(user_a_id, user_b_id, job_id) NULLS NOT DISTINCT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_conversations_pair`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_match_results_pair`);
  }
}
