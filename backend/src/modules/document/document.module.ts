import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Document } from './document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { MatchResult } from '../matching/match-result.entity'
import { DocumentController } from './document.controller'
import { DocumentService } from './document.service'
import { AgentModule } from '../../agents/agent.module'
import { GraphModule } from '../graph/graph.module'
import { LlmModule } from '../llm/llm.module'
import { SkillModule } from '../skill/skill.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill, Skill, MatchResult]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'talent-match-jwt-secret-key-2026',
    }),
    AgentModule,
    GraphModule,
    LlmModule,
    SkillModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
