import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Document } from '../document/document.entity';

@Entity('match_results')
export class MatchResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'resume_doc_id' })
  resumeDocId: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_doc_id' })
  resumeDoc: Document;

  @Column({ name: 'job_doc_id' })
  jobDocId: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_doc_id' })
  jobDoc: Document;

  @Column({ name: 'overall_score', type: 'decimal', precision: 5, scale: 2 })
  overallScore: number;

  @Column({
    name: 'skill_match_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  skillMatchScore: number;

  @Column({
    name: 'city_match_bonus',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  cityMatchBonus: number;

  @Column({ name: 'score_breakdown', type: 'jsonb', nullable: true })
  scoreBreakdown: ScoreBreakdown;

  @Column({ name: 'stale_at', type: 'timestamptz', nullable: true })
  staleAt: Date;

  @Column({ name: 'match_details', type: 'jsonb', nullable: true })
  matchDetails: MatchDetail[];

  @Column({ name: 'algorithm_trace', type: 'jsonb', nullable: true })
  algorithmTrace: AlgorithmStep[] | null;

  @Column({ name: 'llm_assessment', type: 'jsonb', nullable: true })
  llmAssessment: LlmAssessment | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

export interface MatchDetail {
  skillId: number; // positive = ID match, negative = fuzzy match (|sim*100|)
  skillName: string;
  personProficiency: string;
  jobRequirement: string;
  resumeSkillId?: number;
  jobSkillId?: number;
  importance?: string; // required / preferred / optional
}

export interface ScoreBreakdown {
  algorithmScore: number; // 算法技能匹配分 (0-100)
  llmScore: number; // LLM 评分 (0-100)
  overallScore: number; // 最终分 = 算法分×0.5 + LLM分×0.5
  matchStatus: 'computed' | 'fallback';
  algorithmDimensions?: {
    // 算法分维度拆解
    coverage: number; // 技能覆盖率 (60%)
    adequacy: number; // 熟练度达标率 (40%)
  };
}

/** One step in the matching algorithm execution pipeline */
export interface AlgorithmStep {
  phase: string;
  label: string;
  status: 'done' | 'skipped' | 'error';
  durationMs: number;
  summary: string;
  data?: Record<string, unknown>;
}

/** LLM assessment result */
export interface LlmAssessment {
  overallFit: number; // 0-100
  strengths: string[];
  gaps: string[];
  transferableSkills: Array<{
    candidateSkill: string;
    jobRequirement: string;
    transferability: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  readinessMonths: number; // 0-12
  confidence: number; // 0.0-1.0
  reasoning: string;
}
