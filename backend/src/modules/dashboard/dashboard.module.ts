import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { MatchResult } from '../matching/match-result.entity';
import { User } from '../user/user.entity';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill, MatchResult, User]),
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
