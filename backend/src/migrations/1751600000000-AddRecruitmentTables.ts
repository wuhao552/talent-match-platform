import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 创建招聘业务闭环所需表:jobs / applications / notifications / conversations / messages
 */
export class AddRecruitmentTables1751600000000 implements MigrationInterface {
  name = 'AddRecruitmentTables1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 确保 uuid-ossp 扩展存在(提供 uuid_generate_v4())
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1. jobs 岗位表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        enterprise_id UUID NOT NULL,
        document_id UUID,
        title VARCHAR(128) NOT NULL,
        company_name VARCHAR(128),
        department VARCHAR(64),
        description TEXT NOT NULL,
        requirements JSONB,
        location VARCHAR(64),
        salary_min INT,
        salary_max INT,
        salary_unit VARCHAR(16) NOT NULL DEFAULT 'month',
        experience_required VARCHAR(32),
        education_required VARCHAR(32),
        employment_type VARCHAR(20) NOT NULL DEFAULT 'full_time',
        headcount INT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_jobs_enterprise_id ON jobs(enterprise_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
    );

    // 2. applications 投递表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_id UUID NOT NULL,
        applicant_id UUID NOT NULL,
        resume_doc_id UUID NOT NULL,
        match_result_id UUID,
        cover_letter TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'submitted',
        enterprise_note TEXT,
        status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_application_job_applicant UNIQUE (job_id, applicant_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`,
    );

    // 3. notifications 通知表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'system',
        title VARCHAR(128) NOT NULL,
        content TEXT NOT NULL,
        related_id VARCHAR(64),
        related_type VARCHAR(32),
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at)`,
    );

    // 4. conversations 会话表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_a_id UUID NOT NULL,
        user_b_id UUID NOT NULL,
        job_id UUID,
        application_id UUID,
        last_message_at TIMESTAMPTZ,
        unread_a INT NOT NULL DEFAULT 0,
        unread_b INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b_id)`,
    );

    // 5. messages 消息表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID NOT NULL,
        sender_id UUID NOT NULL,
        content TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS conversations`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS applications`);
    await queryRunner.query(`DROP TABLE IF EXISTS jobs`);
  }
}
