import { Module } from '@nestjs/common'
import { DocumentParserAgent } from './document-parser.agent'
import { SkillExtractorAgent } from './skill-extractor.agent'
import { GraphBuilderAgent } from './graph-builder.agent'
import { OrchestratorAgent } from './orchestrator.agent'
import { LlmModule } from '../modules/llm/llm.module'
import { GraphModule } from '../modules/graph/graph.module'
import { SkillModule } from '../modules/skill/skill.module'

@Module({
  imports: [LlmModule, GraphModule, SkillModule],
  providers: [
    DocumentParserAgent,
    SkillExtractorAgent,
    GraphBuilderAgent,
    OrchestratorAgent,
  ],
  exports: [OrchestratorAgent],
})
export class AgentModule {}
