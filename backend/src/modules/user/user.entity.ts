/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 用户实体 - 新增 status 字段用于管理员禁用/启用用户
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export type UserRole = 'individual' | 'enterprise' | 'admin'
export type UserStatus = 'active' | 'disabled'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true, length: 64 })
  username: string

  @Column({ name: 'password_hash', length: 256 })
  passwordHash: string

  @Column({ type: 'varchar', length: 20 })
  role: UserRole

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: UserStatus

  @Column({ nullable: true, length: 128 })
  email: string

  @Column({ nullable: true, length: 32 })
  phone: string

  @Column({ nullable: true, length: 64 })
  city: string

  @Column({ name: 'intended_cities', type: 'jsonb', nullable: true })
  intendedCities: string[]

  @Column({ name: 'company_name', nullable: true, length: 128 })
  companyName: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
