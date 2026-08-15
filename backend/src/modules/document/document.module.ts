import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { AgentModule } from '../../agents/agent.module';
import { GraphModule } from '../graph/graph.module';
import { LlmModule } from '../llm/llm.module';
import { MatchingModule } from '../matching/matching.module';
import { JobModule } from '../job/job.module';
import { SkillModule } from '../skill/skill.module';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET 环境变量未配置，请在 backend/.env 中设置');
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill, Skill, MatchResult]),
    JwtModule.register({
      secret: jwtSecret,
    }),
    AgentModule,
    GraphModule,
    LlmModule,
    forwardRef(() => MatchingModule),
    JobModule,
    SkillModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
