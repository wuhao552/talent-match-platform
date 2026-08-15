/**
 * @description 投递实体 - 求职者对岗位的投递记录及状态机历史
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';
import { Job } from '../job/job.entity';

export type ApplicationStatus =
  | 'submitted'
  | 'viewed'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export interface StatusChange {
  status: ApplicationStatus;
  at: string;
  by: string;
  note?: string;
}

@Entity('applications')
@Unique('uq_application_job_applicant', ['jobId', 'applicantId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id' })
  @Index()
  jobId: string;

  @ManyToOne(() => Job)
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'applicant_id' })
  @Index()
  applicantId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'applicant_id' })
  applicant: User;

  /** 投递使用的简历文档 */
  @Column({ name: 'resume_doc_id' })
  resumeDocId: string;

  /** 关联的匹配结果,可选 */
  @Column({ name: 'match_result_id', type: 'uuid', nullable: true })
  matchResultId: string | null;

  @Column({ name: 'cover_letter', type: 'text', nullable: true })
  coverLetter: string;

  @Column({ type: 'varchar', length: 20, default: 'submitted' })
  @Index()
  status: ApplicationStatus;

  /** 企业端备注 */
  @Column({ name: 'enterprise_note', type: 'text', nullable: true })
  enterpriseNote: string;

  /** 状态变更历史 */
  @Column({ name: 'status_history', type: 'jsonb', default: [] })
  statusHistory: StatusChange[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
