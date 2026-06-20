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

  @Column({ name: 'algorithm_trace', type: 'jsonb', nullable: true })
  algorithmTrace: AlgorithmStep[] | null

  @Column({ name: 'llm_assessment', type: 'jsonb', nullable: true })
  llmAssessment: LlmAssessment | null

  @Column({ name: 'community_context', type: 'jsonb', nullable: true })
  communityContext: CommunityContext | null

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
  // ── Phase 1: Algorithm scores ──
  skillMatchScore: number       // 0-100, weighted skill matching score
  cooccurrenceBonus: number     // 0-10, from knowledge graph co-occurrence
  cityMatchBonus: number        // 0-8, same-city bonus
  hotnessBonus: number          // 0-8, high-demand skill bonus
  experienceBonus: number       // 0-5, years-of-experience surplus bonus
  industryMatchBonus: number    // 0-4, same-industry bonus
  trendBonus: number            // 0-3, skill demand trend adjustment
  algorithmScore: number        // Phase 1 raw score (0-100)
  // ── Phase 2: LLM assessment ──
  llmScore?: number             // LLM raw score (0-100)
  // ── Phase 3: Fusion ──
  overallScore: number          // Final fused score (0-100)
  fusionWeights?: { algorithm: number; llm: number }
  matchStatus?: 'computed' | 'fallback'
}

/** One step in the matching algorithm execution pipeline */
export interface AlgorithmStep {
  phase: string          // e.g. "skill_matching", "community_context", "llm_assessment"
  label: string          // Human-readable label
  status: 'done' | 'skipped' | 'error'
  durationMs: number
  summary: string        // One-line summary
  data?: Record<string, unknown>  // Detailed output
}

/** LLM assessment result stored in match */
export interface LlmAssessment {
  overallFit: number           // 0-100
  strengths: string[]          // Key matching strengths
  gaps: string[]               // Identified gaps
  transferableSkills: Array<{
    candidateSkill: string
    jobRequirement: string
    transferability: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  readinessMonths: number      // 0-6
  confidence: number           // 0.0-1.0
  reasoning: string            // Full LLM reasoning text
}

/** Community context used during matching */
export interface CommunityContext {
  resumeCommunities: Array<{ title: string; summary: string; skillDomain: string }>
  jobCommunities: Array<{ title: string; summary: string; skillDomain: string }>
  domainOverlap: string[]      // Shared domains
}
