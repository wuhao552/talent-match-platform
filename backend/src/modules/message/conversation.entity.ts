/**
 * @description 会话实体 - 两个用户之间的站内消息会话
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 会话发起者 */
  @Column({ name: 'user_a_id' })
  @Index()
  userAId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_a_id' })
  userA: User;

  /** 会话另一方 */
  @Column({ name: 'user_b_id' })
  @Index()
  userBId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_b_id' })
  userB: User;

  /** 关联岗位,可选(基于岗位咨询发起的会话) */
  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId: string | null;

  /** 关联投递,可选 */
  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  /** userA 侧未读数 */
  @Column({ name: 'unread_a', type: 'int', default: 0 })
  unreadA: number;

  /** userB 侧未读数 */
  @Column({ name: 'unread_b', type: 'int', default: 0 })
  unreadB: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
