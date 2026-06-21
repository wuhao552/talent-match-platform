import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmService } from './llm.service';
import { EmbeddingService } from './embedding.service';
import { LlmCacheEntity } from './llm-cache.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LlmCacheEntity])],
  providers: [LlmService, EmbeddingService],
  exports: [LlmService, EmbeddingService],
})
export class LlmModule {}
