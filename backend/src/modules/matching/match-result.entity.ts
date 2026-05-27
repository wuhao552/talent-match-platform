import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Document } from '../document/document.entity'

@Entity('match_results')
export class MatchResult {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'resume_doc_id' })
  resumeDocId: string

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_doc_id' })
  resumeDoc: Document

  @Column({ name: 'job_doc_id' })
  jobDocId: string

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_doc_id' })
  jobDoc: Document

  @Column({ name: 'overall_score', type: 'decimal', precision: 5, scale: 2 })
  overallScore: number

  @Column({ name: 'skill_match_score', type: 'decimal', precision: 5, scale: 2 })
  skillMatchScore: number

  @Column({ name: 'city_match_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  cityMatchBonus: number

  @Column({ name: 'cooccurrence_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  cooccurrenceBonus: number

  @Column({ name: 'hotness_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  hotnessBonus: number

  @Column({ name: 'experience_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  experienceBonus: number

  @Column({ name: 'industry_match_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  industryMatchBonus: number

  @Column({ name: 'trend_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  trendBonus: number

  @Column({ name: 'score_breakdown', type: 'jsonb', nullable: true })
  scoreBreakdown: ScoreBreakdown

  @Column({ name: 'stale_at', type: 'timestamptz', nullable: true })
  staleAt: Date

  @Column({ name: 'match_details', type: 'jsonb', nullable: true })
  matchDetails: MatchDetail[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}

export interface MatchDetail {
  skillId: number           // canonical match ID (positive for ID match, negative for fuzzy)
  skillName: string
  personProficiency: string
  jobRequirement: string
  score: number
  resumeSkillId?: number    // actual resume-side skill ID (for graph edges)
  jobSkillId?: number       // actual job-side skill ID (for graph edges)
  importance?: string       // job skill importance: required/preferred/optional
  hotnessBoost?: number     // additional score from skill hotness weighting
}

export interface ScoreBreakdown {
  skillMatchScore: number       // 0-100, weighted skill matching score
  cooccurrenceBonus: number     // 0-15, from knowledge graph co-occurrence
  cityMatchBonus: number        // 0-10, same-city bonus
  hotnessBonus: number          // 0-10, high-demand skill bonus
  experienceBonus: number       // 0-5, years-of-experience surplus bonus
  industryMatchBonus: number    // 0-5, same-industry bonus
  trendBonus: number            // -5 to +5, skill demand trend adjustment
  overallScore: number          // 0-100, final combined score
}
