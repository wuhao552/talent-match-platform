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

  @Column({ name: 'hotness', type: 'decimal', precision: 5, scale: 4, nullable: true })
  hotness: number

  @Column({ name: 'demand_trend', type: 'decimal', precision: 8, scale: 4, nullable: true })
  demandTrend: number

  @Column({ name: 'avg_demand_6m', type: 'decimal', precision: 12, scale: 4, nullable: true })
  avgDemand6m: number

  @Column({ name: 'break_direction', type: 'varchar', length: 16, nullable: true })
  breakDirection: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
