import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MatchResult } from './match-result.entity';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { User } from '../user/user.entity';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { LlmMatchingService } from './llm-matching.service';
import { SkillModule } from '../skill/skill.module';
import { LlmModule } from '../llm/llm.module';
import { DocumentModule } from '../document/document.module';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET 环境变量未配置，请在 backend/.env 中设置');
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MatchResult,
      Document,
      DocumentSkill,
      Skill,
      User,
    ]),
    SkillModule,
    LlmModule,
    forwardRef(() => DocumentModule),
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MatchingController],
  providers: [MatchingService, LlmMatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
