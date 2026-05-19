import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Skill } from './skill.entity'
import { SkillController } from './skill.controller'
import { SkillService } from './skill.service'
import { GraphModule } from '../graph/graph.module'

@Module({
  imports: [TypeOrmModule.forFeature([Skill]), GraphModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
