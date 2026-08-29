import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { LlmModule } from '../llm/llm.module';
import { MatchResult } from '../matching/match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { User } from '../user/user.entity';
import { JwtConfigModule } from '../../common/jwt-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchResult,
      Document,
      DocumentSkill,
      Skill,
      User,
    ]),
    LlmModule,
    JwtConfigModule,
  ],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
