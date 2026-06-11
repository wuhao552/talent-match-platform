import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MatchResult } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { User } from '../user/user.entity'
import { MatchingController } from './matching.controller'
import { MatchingService } from './matching.service'
import { GraphModule } from '../graph/graph.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchResult, Document, DocumentSkill, Skill, User]),
    GraphModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
