import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Skill } from './skill.entity'
import { SkillController } from './skill.controller'
import { SkillService } from './skill.service'
import { SkillSeedService } from './skill-seed.service'
import { SkillMatcherService } from './skill-matcher.service'
import { GraphModule } from '../graph/graph.module'

@Module({
  imports: [TypeOrmModule.forFeature([Skill]), GraphModule],
  controllers: [SkillController],
  providers: [SkillService, SkillSeedService, SkillMatcherService],
  exports: [SkillService, SkillSeedService, SkillMatcherService],
})
export class SkillModule {}
