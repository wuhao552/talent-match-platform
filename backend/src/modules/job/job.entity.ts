/**
 * @description 岗位实体 - 独立于 document,支持结构化字段、上下架、有效期
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

export type JobStatus = 'draft' | 'published' | 'closed' | 'archived';
export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'internship'
  | 'contract';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enterprise_id' })
  @Index()
  enterpriseId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: User;

  /** 可选关联到 job_description 文档,复用解析结果 */
  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ length: 128 })
  title: string;

  @Column({ name: 'company_name', nullable: true, length: 128 })
  companyName: string;

  @Column({ nullable: true, length: 64 })
  department: string;

  @Column({ type: 'text' })
  description: string;

  /** 结构化任职要求,如 { skills: [...], must: [...], nice: [...] } */
  @Column({ name: 'requirements', type: 'jsonb', nullable: true })
  requirements: Record<string, unknown> | null;

  @Column({ nullable: true, length: 64 })
  location: string;

  @Column({ name: 'salary_min', type: 'int', nullable: true })
  salaryMin: number | null;

  @Column({ name: 'salary_max', type: 'int', nullable: true })
  salaryMax: number | null;

  @Column({
    name: 'salary_unit',
    type: 'varchar',
    length: 16,
    default: 'month',
  })
  salaryUnit: string;

  @Column({ name: 'experience_required', nullable: true, length: 32 })
  experienceRequired: string;

  @Column({ name: 'education_required', nullable: true, length: 32 })
  educationRequired: string;

  @Column({
    name: 'employment_type',
    type: 'varchar',
    length: 20,
    default: 'full_time',
  })
  employmentType: EmploymentType;

  @Column({ name: 'headcount', type: 'int', default: 1 })
  headcount: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  @Index()
  status: JobStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
