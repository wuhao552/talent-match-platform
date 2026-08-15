/**
 * @description 站内通知实体 - 系统事件通知(匹配成功/投递状态变更/文档解析完成等)
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type NotificationType =
  | 'system'
  | 'match'
  | 'application'
  | 'message'
  | 'job';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'system' })
  type: NotificationType;

  @Column({ length: 128 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** 关联业务实体 id */
  @Column({ name: 'related_id', type: 'varchar', length: 64, nullable: true })
  relatedId: string | null;

  @Column({ name: 'related_type', type: 'varchar', length: 32, nullable: true })
  relatedType: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
