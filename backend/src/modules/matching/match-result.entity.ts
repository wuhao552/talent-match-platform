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

  @ManyToOne(() => Document)
  @JoinColumn({ name: 'resume_doc_id' })
  resumeDoc: Document

  @Column({ name: 'job_doc_id' })
  jobDocId: string

  @ManyToOne(() => Document)
  @JoinColumn({ name: 'job_doc_id' })
  jobDoc: Document

  @Column({ name: 'overall_score', type: 'decimal', precision: 5, scale: 2 })
  overallScore: number

  @Column({ name: 'skill_match_score', type: 'decimal', precision: 5, scale: 2 })
  skillMatchScore: number

  @Column({ name: 'city_match_bonus', type: 'decimal', precision: 5, scale: 2, default: 0 })
  cityMatchBonus: number

  @Column({ name: 'match_details', type: 'jsonb', nullable: true })
  matchDetails: MatchDetail[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}

export interface MatchDetail {
  skillId: number
  skillName: string
  personProficiency: string
  jobRequirement: string
  score: number
}
