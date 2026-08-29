import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { AgentModule } from '../../agents/agent.module';
import { GraphModule } from '../graph/graph.module';
import { MatchingModule } from '../matching/matching.module';
import { JobModule } from '../job/job.module';
import { SkillModule } from '../skill/skill.module';
import { JwtConfigModule } from '../../common/jwt-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill, Skill, MatchResult]),
    JwtConfigModule,
    AgentModule,
    GraphModule,
    forwardRef(() => MatchingModule),
    JobModule,
    SkillModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
