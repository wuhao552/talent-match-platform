import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmService } from './llm.service';
import { EmbeddingService } from './embedding.service';
import { LlmLog } from './llm-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LlmLog])],
  providers: [LlmService, EmbeddingService],
  exports: [LlmService, EmbeddingService],
})
export class LlmModule {}
