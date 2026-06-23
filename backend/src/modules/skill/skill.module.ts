import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './skill.entity';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillSeedService } from './skill-seed.service';
import { SkillMatcherService } from './skill-matcher.service';
import { GraphModule } from '../graph/graph.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Skill]),
    forwardRef(() => GraphModule),
    LlmModule,
  ],
  controllers: [SkillController],
  providers: [
    SkillService,
    SkillSeedService,
    SkillMatcherService,
  ],
  exports: [
    SkillService,
    SkillMatcherService,
  ],
})
export class SkillModule {}
