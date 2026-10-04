import { Module } from '@nestjs/common';
import { DocumentParserAgent } from './document-parser.agent';
import { SkillExtractorAgent } from './skill-extractor.agent';
import { OrchestratorAgent } from './orchestrator.agent';
import { LlmModule } from '../modules/llm/llm.module';
import { SkillModule } from '../modules/skill/skill.module';

@Module({
  imports: [LlmModule, SkillModule],
  providers: [DocumentParserAgent, SkillExtractorAgent, OrchestratorAgent],
  exports: [OrchestratorAgent],
})
export class AgentModule {}
