import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('llm_cache')
@Index('idx_llm_cache_expires', ['expiresAt'])
export class LlmCacheEntity {
  @PrimaryColumn({ name: 'cache_key', type: 'varchar', length: 64 })
  cacheKey: string;

  @Column({ name: 'response', type: 'text' })
  response: string;

  @Column({ name: 'method', type: 'varchar', length: 32 })
  method: string;

  @Column({ name: 'model', type: 'varchar', length: 64 })
  model: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
