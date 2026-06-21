export interface AgentContext {
  sessionId: string;
  userId: string;
  input: Record<string, unknown>;
  onChunk?: (token: string) => void;
}

export interface AgentResult {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
  error?: string;
}

export interface AgentDefinition {
  agentType: string;
  description: string;
  whenToUse: string;
  tools: string[];
  model?: string;
}

export interface IAgent {
  readonly definition: AgentDefinition;
  execute(context: AgentContext): Promise<AgentResult>;
}
