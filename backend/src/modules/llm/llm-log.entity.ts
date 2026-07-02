import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('llm_logs')
export class LlmLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'call_type', length: 32 })
  callType:
    | 'extract_skills'
    | 'parse_document'
    | 'parse_job_description'
    | 'extract_job_skills'
    | 'assess_match'
    | 'generate_explanation';

  @Column({ length: 64 })
  model: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  @Column({ name: 'user_message', type: 'text' })
  userMessage: string;

  @Column({ name: 'raw_response', type: 'text', nullable: true })
  rawResponse: string;

  @Column({ name: 'parsed_result', type: 'jsonb', nullable: true })
  parsedResult: Record<string, unknown>;

  @Column({ default: false })
  success: boolean;

  @Column({ name: 'fallback_used', default: false })
  fallbackUsed: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'tokens_used', nullable: true })
  tokensUsed: number;

  @Column({ name: 'latency_ms', nullable: true })
  latencyMs: number;

  @Column({ name: 'document_id', nullable: true, length: 64 })
  documentId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
