/**
 * @author 应飞帆
 * @date 2026-05-25
 * @description 管理员审计日志实体 - 记录管理员敏感操作
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { User } from '../user/user.entity'

export type AuditAction = 'disable_user' | 'enable_user' | 'delete_user' | 'reparse_document' | 'delete_document'
export type AuditTargetType = 'user' | 'document'

@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'admin_id' })
  adminId: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'admin_id' })
  admin: User

  @Column({ type: 'varchar', length: 32 })
  action: AuditAction

  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType: AuditTargetType

  @Column({ name: 'target_id' })
  targetId: string

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
