import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GraphController } from './graph.controller';
import { GraphLayoutService } from './graph-layout.service';
import { SkillModule } from '../skill/skill.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'talent-match-jwt-secret-key-2026',
    }),
    forwardRef(() => SkillModule),
  ],
  controllers: [GraphController],
  providers: [GraphLayoutService],
  exports: [GraphLayoutService],
})
export class GraphModule {}
