import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './skill.entity';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillSeedService } from './skill-seed.service';
import { SkillMatcherService } from './skill-matcher.service';

@Module({
  imports: [TypeOrmModule.forFeature([Skill])],
  controllers: [SkillController],
  providers: [SkillService, SkillSeedService, SkillMatcherService],
  exports: [SkillService, SkillMatcherService],
})
export class SkillModule {}
