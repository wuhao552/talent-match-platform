import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1751443000000
  implements MigrationInterface
{
  name = 'AddPerformanceIndexes1751443000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // documents: 按用户+时间倒序查列表
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC)`,
    );
    // documents: 按状态、类型+状态筛选
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents(doc_type, status)`,
    );

    // match_results: 核心匹配对查询与去重
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_match_results_resume_job_stale ON match_results(resume_doc_id, job_doc_id, stale_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_match_results_resume_stale ON match_results(resume_doc_id, stale_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_match_results_job_stale ON match_results(job_doc_id, stale_at)`,
    );

    // document_skills: 按文档查技能、按技能查文档
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_document_skills_document_id ON document_skills(document_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_document_skills_skill_id ON document_skills(skill_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_document_skills_doc_skill ON document_skills(document_id, skill_id)`,
    );

    // llm_logs: 按时间、类型+时间查询
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_logs_created_at ON llm_logs(created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_llm_logs_call_type_created ON llm_logs(call_type, created_at DESC)`,
    );

    // admin_audit_logs: 按管理员+时间查询
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created ON admin_audit_logs(admin_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)`,
    );

    // skills: 按名称、类别查询/匹配
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_name`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_admin_audit_logs_created_at`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_admin_audit_logs_admin_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_llm_logs_call_type_created`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_llm_logs_created_at`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_document_skills_doc_skill`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_document_skills_skill_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_document_skills_document_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_match_results_job_stale`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_match_results_resume_stale`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_match_results_resume_job_stale`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_documents_type_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_documents_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_documents_user_created`);
  }
}
