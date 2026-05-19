import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../user/user.entity'

export type DocType = 'resume' | 'job_description'
export type DocStatus = 'uploaded' | 'parsing' | 'parsed' | 'failed'
export type FileFormat = 'pdf' | 'docx' | 'doc'

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ name: 'doc_type', type: 'varchar', length: 20 })
  docType: DocType

  @Column({ name: 'original_filename', length: 256 })
  originalFilename: string

  @Column({ name: 'file_path', length: 512 })
  filePath: string

  @Column({ name: 'file_format', type: 'varchar', length: 10 })
  fileFormat: FileFormat

  @Column({ name: 'parsed_text', type: 'text', nullable: true })
  parsedText: string

  @Column({ name: 'parsed_json', type: 'jsonb', nullable: true })
  parsedJson: Record<string, unknown>

  @Column({ type: 'varchar', length: 20, default: 'uploaded' })
  status: DocStatus

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
