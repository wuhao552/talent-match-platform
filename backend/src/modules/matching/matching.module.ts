import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MatchResult } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { User } from '../user/user.entity'
import { MatchingController } from './matching.controller'
import { MatchingService } from './matching.service'
import { LlmMatchingService } from './llm-matching.service'
import { GraphModule } from '../graph/graph.module'
import { SkillModule } from '../skill/skill.module'
import { LlmModule } from '../llm/llm.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchResult, Document, DocumentSkill, Skill, User]),
    GraphModule,
    SkillModule,
    LlmModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService, LlmMatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
