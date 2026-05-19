import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Document } from './document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { DocumentController } from './document.controller'
import { DocumentService } from './document.service'
import { AgentModule } from '../../agents/agent.module'
import { LlmModule } from '../llm/llm.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill, Skill]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'talent-match-jwt-secret-key-2026',
    }),
    AgentModule,
    LlmModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
