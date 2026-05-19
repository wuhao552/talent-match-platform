import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Document } from '../document/document.entity'
import { Skill } from './skill.entity'

export type Proficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert'

@Entity('document_skills')
export class DocumentSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'document_id' })
  documentId: string

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document

  @Column({ name: 'skill_id' })
  skillId: number

  @ManyToOne(() => Skill)
  @JoinColumn({ name: 'skill_id' })
  skill: Skill

  @Column({ type: 'varchar', length: 20, nullable: true })
  proficiency: Proficiency

  @Column({ name: 'years_of_experience', type: 'decimal', precision: 4, scale: 1, nullable: true })
  yearsOfExperience: number

  @Column({ name: 'skill_name', length: 128, nullable: true })
  skillName: string

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  confidence: number

  @Column({ name: 'source_text', type: 'text', nullable: true })
  sourceText: string

  @Column({ name: 'extraction_method', length: 16, nullable: true })
  extractionMethod: string  // 'llm' | 'rule'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
