import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchResult } from './match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { User } from '../user/user.entity';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatchEnrichmentService } from './match-enrichment.service';
import { MatchScoringService } from './match-scoring.service';
import { LlmMatchingService } from './llm-matching.service';
import { LlmModule } from '../llm/llm.module';
import { DocumentModule } from '../document/document.module';
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
    forwardRef(() => DocumentModule),
    JwtConfigModule,
  ],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchEnrichmentService,
    MatchScoringService,
    LlmMatchingService,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
