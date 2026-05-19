import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('skills')
export class Skill {
  @PrimaryColumn()
  id: number

  @Column({ nullable: true, length: 128 })
  name: string

  @Column({ nullable: true, length: 64 })
  category: string

  @Column({ name: 'has_structural_break', default: false })
  hasStructuralBreak: boolean

  @Column({ name: 'is_low_frequency', default: false })
  isLowFrequency: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
