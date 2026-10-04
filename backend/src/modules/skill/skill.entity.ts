import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('skills')
export class Skill {
  @PrimaryColumn()
  id: number;

  @Column({ nullable: true, length: 128 })
  name: string;

  @Column({ nullable: true, length: 64 })
  category: string;

  @Column({ name: 'core_name', nullable: true, length: 128 })
  coreName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
