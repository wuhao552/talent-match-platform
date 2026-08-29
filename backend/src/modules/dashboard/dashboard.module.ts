import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../document/document.entity';
import { DocumentSkill } from '../skill/document-skill.entity';
import { DashboardController } from './dashboard.controller';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSkill]),
    MatchingModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
