import { Module, forwardRef } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { Neo4jService } from './neo4j.service'
import { GraphController } from './graph.controller'
import { CommunityDetectionService } from './community-detection.service'
import { GraphLayoutService } from './graph-layout.service'
import { SkillModule } from '../skill/skill.module'

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'talent-match-jwt-secret-key-2026',
    }),
    forwardRef(() => SkillModule),
  ],
  controllers: [GraphController],
  providers: [Neo4jService, CommunityDetectionService, GraphLayoutService],
  exports: [Neo4jService, CommunityDetectionService, GraphLayoutService],
})
export class GraphModule {}
