import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmLog } from './llm-log.entity';
import {
  RESUME_SKILL_EXTRACTION_PROMPT,
  RESUME_PARSE_PROMPT,
  JOB_PARSE_PROMPT,
  JOB_SKILL_EXTRACTION_PROMPT,
  INTERVIEW_QUESTIONS_PROMPT,
  COACH_ADVICE_PROMPT,
  buildChatSystemPrompt,
} from './llm.prompts';

export interface ExtractedSkill {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  confidence: number;
  sourceText: string;
}

export interface LlmCallDetail {
  model: string;
  systemPrompt: string;
  userMessage: string;
  rawResponse: string;
  parsedResult: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  tokensUsed?: number;
  latencyMs: number;
}

@Injectable()
export class LlmService {
  constructor(
    @InjectRepository(LlmLog)
    private logRepo: Repository<LlmLog>,
  ) {}

  // 统一使用 v4-flash
  private readonly flashModel = 'deepseek-v4-flash';
  private readonly proModel = process.env.LLM_MODEL || 'deepseek-v4-flash';

  /**
   * 统一调用入口：支持流式回调。
   */
  private async callLLMWithLog(
    method: string,
    systemPrompt: string,
    userMessage: string,
    model: string,
    onChunk?: (token: string) => void,
  ): Promise<string> {
    const startTime = Date.now();
    let rawResponse: string;
    let success = true;
    let errorMessage: string | undefined;

    try {
      if (onChunk) {
        rawResponse = '';
        for await (const chunk of this.callLLMStream(
          systemPrompt,
          userMessage,
          model,
        )) {
          if (!chunk.done) onChunk(chunk.token);
          rawResponse = chunk.fullText;
        }
      } else {
        rawResponse = await this.callLLM(systemPrompt, userMessage, model);
      }
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : 'LLM 调用失败';
      this.saveLlmLog({
        callType: method as any,
        model,
        systemPrompt,
        userMessage,
        rawResponse: '',
        success: false,
        errorMessage,
        latencyMs: Date.now() - startTime,
      }).catch(() => {});
      throw err;
    }

    this.saveLlmLog({
      callType: method as any,
      model,
      systemPrompt,
      userMessage,
      rawResponse,
      success: true,
      latencyMs: Date.now() - startTime,
    }).catch(() => {});
    return rawResponse;
  }

  /**
   * 写入 LLM 调用日志，失败不影响主流程。
   */
  private async saveLlmLog(payload: {
    callType: LlmLog['callType'];
    model: string;
    systemPrompt: string;
    userMessage: string;
    rawResponse: string;
    success: boolean;
    errorMessage?: string;
    latencyMs: number;
    tokensUsed?: number;
    documentId?: string;
  }): Promise<void> {
    try {
      await this.logRepo.save(this.logRepo.create(payload));
    } catch {
      // 日志写入失败不应影响 LLM 主流程
    }
  }

  /**
   * 通用 JSON 对象解析：调用 LLM 并提取第一个 JSON 对象。
   */
  private async callJsonPrompt(
    method: string,
    systemPrompt: string,
    userMessage: string,
    model: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      method,
      systemPrompt,
      userMessage,
      model,
      onChunk,
    );
    const latencyMs = Date.now() - startTime;
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    return {
      parsed,
      detail: {
        model,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: parsed,
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    };
  }

  /**
   * 通用 JSON 数组解析：调用 LLM 并提取第一个 JSON 数组。
   */
  private async callJsonArrayPrompt(
    method: string,
    systemPrompt: string,
    userMessage: string,
    model: string,
    onChunk?: (token: string) => void,
  ): Promise<{ items: Record<string, unknown>[]; detail: LlmCallDetail }> {
    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      method,
      systemPrompt,
      userMessage,
      model,
      onChunk,
    );
    const latencyMs = Date.now() - startTime;
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }
    const items = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];

    return {
      items,
      detail: {
        model,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: { items },
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    };
  }

  /**
   * 技能提取 — 简单任务，用 flash 模型
   */
  async extractSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = RESUME_SKILL_EXTRACTION_PROMPT;

    const userMessage = `请从以下文本中提取技能：\n\n${text.slice(0, 8000)}`;

    const { items, detail } = await this.callJsonArrayPrompt(
      'extractSkills',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );
    const skills: ExtractedSkill[] = items.map((s) => ({
      name: String(s.name ?? ''),
      proficiency: this.validateProficiency(String(s.proficiency ?? '')),
      confidence: 0.95,
      sourceText: '',
    }));

    return { skills, detail: { ...detail, parsedResult: { skills } } };
  }

  async parseDocument(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = RESUME_PARSE_PROMPT;

    const userMessage = `请解析以下文档：\n\n${text.slice(0, 8000)}`;

    return this.callJsonPrompt(
      'parseDocument',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );
  }

  /**
   * 岗位描述解析 — 企业端专用，提取字段与简历完全不同
   */
  async parseJobDescription(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = JOB_PARSE_PROMPT;

    const userMessage = `请解析以下岗位描述：\n\n${text.slice(0, 8000)}`;

    return this.callJsonPrompt(
      'parseJobDescription',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );
  }

  /**
   * 岗位技能提取 — 企业端专用，提取任职要求中的技能及期望熟练度
   */
  async extractJobSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = JOB_SKILL_EXTRACTION_PROMPT;

    const userMessage = `请从以下岗位描述中提取技能要求：\n\n${text.slice(0, 8000)}`;

    const { items, detail } = await this.callJsonArrayPrompt(
      'extractJobSkills',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );
    const skills: ExtractedSkill[] = items.map((s) => ({
      name: String(s.name ?? ''),
      proficiency: this.validateProficiency(String(s.proficiency ?? '')),
      confidence: 0.95,
      sourceText: '',
    }));

    return { skills, detail: { ...detail, parsedResult: { skills } } };
  }

  /**
   * 流式 LLM 调用 — 逐个 token 返回，同时累积完整响应
   */
  async *callLLMStream(
    systemPrompt: string,
    userMessage: string,
    model: string,
  ): AsyncGenerator<{ token: string; done: boolean; fullText: string }> {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY 未配置');

    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let fullText = '';

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 16000,
          stream: true,
          thinking: { type: 'disabled' },
        }),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = `LLM API 错误 ${response.status}`;
        try {
          const errJson = JSON.parse(errBody);
          errMsg += `: ${errJson.error?.message || errBody}`;
        } catch {
          errMsg += `: ${errBody.slice(0, 200)}`;
        }
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('流式响应 body 为空');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const json = trimmed.slice(5).trim();
          if (json === '[DONE]') continue;

          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield { token: delta, done: false, fullText };
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      yield { token: '', done: true, fullText };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 核心 LLM 调用 — 关闭思考模式（非流式）
   */
  async callLLM(
    systemPrompt: string,
    userMessage: string,
    model?: string,
  ): Promise<string> {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY 未配置，请在 .env 中设置 API Key');
    }

    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
    const useModel = model || this.proModel;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 16000,
          thinking: { type: 'disabled' },
        }),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = `LLM API 错误 ${response.status}`;
        try {
          const errJson = JSON.parse(errBody);
          errMsg += `: ${errJson.error?.message || errBody}`;
        } catch {
          errMsg += `: ${errBody.slice(0, 200)}`;
        }
        throw new Error(errMsg);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };

      const content = data.choices[0]?.message?.content || '';
      if (!content.trim()) {
        throw new Error(
          `LLM 返回空内容 (model=${useModel}, thinking=disabled)`,
        );
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  AI 助手：面试题生成 / 智能问答 / 候选人 AI 教练
  //  这些方法复用 'generate_explanation' callType（已在 LlmLog 枚举中预留）
  // ════════════════════════════════════════════════════════════════

  /**
   * 面试题生成：基于一对 resume-job 的匹配结果，生成定制化面试题。
   * 围绕 strengths/gaps/transferableSkills 出题，覆盖技术深度、差距探测、迁移能力、行为四个维度。
   */
  async generateInterviewQuestions(
    params: {
      resumeSkills: Array<{ name: string; proficiency: string }>;
      jobSkills: Array<{ name: string; proficiency: string }>;
      matchDetails: Array<{
        skillName: string;
        personProficiency: string;
        jobRequirement: string;
      }>;
      llmAssessment?: {
        overallFit: number;
        strengths: string[];
        gaps: string[];
        transferableSkills: Array<{
          candidateSkill: string;
          jobRequirement: string;
          transferability: string;
        }>;
        readinessMonths: number;
      } | null;
      resumeText?: string;
      jobText?: string;
    },
    onChunk?: (token: string) => void,
  ): Promise<{
    questions: Array<{
      category: string;
      difficulty: string;
      question: string;
      intent: string;
      referenceAnswer: string;
      skillTag: string;
    }>;
    raw: string;
  }> {
    const { resumeSkills, jobSkills, matchDetails, llmAssessment } = params;

    const contextParts: string[] = [];
    contextParts.push('## 候选人技能');
    for (const s of resumeSkills.slice(0, 30))
      contextParts.push(`- ${s.name} [${s.proficiency}]`);
    contextParts.push('## 职位要求技能');
    for (const s of jobSkills.slice(0, 30))
      contextParts.push(`- ${s.name} [${s.proficiency}]`);
    if (matchDetails.length > 0) {
      contextParts.push('## 已匹配技能');
      for (const m of matchDetails.slice(0, 15))
        contextParts.push(
          `- ${m.skillName}: 候选人[${m.personProficiency}] → 要求[${m.jobRequirement}]`,
        );
    }
    if (llmAssessment) {
      contextParts.push('## LLM 评估结果');
      contextParts.push(`- 匹配度: ${llmAssessment.overallFit}/100`);
      contextParts.push(`- 上手周期: ${llmAssessment.readinessMonths} 个月`);
      if (llmAssessment.strengths.length > 0)
        contextParts.push(`- 优势: ${llmAssessment.strengths.join('；')}`);
      if (llmAssessment.gaps.length > 0)
        contextParts.push(`- 差距: ${llmAssessment.gaps.join('；')}`);
      if (llmAssessment.transferableSkills.length > 0) {
        contextParts.push('## 可迁移技能');
        for (const t of llmAssessment.transferableSkills.slice(0, 8))
          contextParts.push(
            `- ${t.candidateSkill} → ${t.jobRequirement} [${t.transferability}]`,
          );
      }
    }
    if (params.resumeText)
      contextParts.push(`## 简历摘要\n${params.resumeText.slice(0, 1500)}`);
    if (params.jobText)
      contextParts.push(`## 职位描述摘要\n${params.jobText.slice(0, 1500)}`);

    const userMessage = contextParts.join('\n');

    const systemPrompt = INTERVIEW_QUESTIONS_PROMPT;

    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      'generate_explanation',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    void startTime; // 仅用于潜在的延迟统计

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return {
        questions: [],
        raw: rawResponse,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return { questions: [], raw: rawResponse };
    }

    if (!Array.isArray(parsed)) {
      return { questions: [], raw: rawResponse };
    }

    const validCategories = ['技术深度', '差距探测', '迁移能力', '行为项目'];
    const validDifficulties = ['基础', '进阶', '压栈'];

    const questions = parsed
      .filter(
        (v): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null,
      )
      .map((v) => ({
        category: validCategories.includes(v.category as string)
          ? (v.category as string)
          : '技术深度',
        difficulty: validDifficulties.includes(v.difficulty as string)
          ? (v.difficulty as string)
          : '进阶',
        question: typeof v.question === 'string' ? v.question : '',
        intent: typeof v.intent === 'string' ? v.intent : '',
        referenceAnswer:
          typeof v.referenceAnswer === 'string' ? v.referenceAnswer : '',
        skillTag: typeof v.skillTag === 'string' ? v.skillTag : '',
      }))
      .filter((q) => q.question.length > 0);

    return { questions, raw: rawResponse };
  }

  /**
   * 候选人 AI 教练：基于用户历史匹配结果，生成职业成长路径建议。
   * 复用 match_results.llm_assessment 中的 gaps/transferableSkills/readinessMonths，
   * 不调用新模型评估，只做规划性输出。
   */
  async generateCoachAdvice(
    params: {
      userSkills: Array<{
        name: string;
        proficiency: string;
        category?: string;
      }>;
      recentMatches: Array<{
        jobTitle: string;
        companyName?: string;
        overallFit: number;
        readinessMonths: number;
        gaps: string[];
        transferableSkills: Array<{
          candidateSkill: string;
          jobRequirement: string;
          transferability: string;
        }>;
      }>;
    },
    onChunk?: (token: string) => void,
  ): Promise<{
    plan: {
      summary: string;
      shortTermGoals: Array<{
        goal: string;
        weeks: number;
        actions: string[];
      }>;
      skillGapsToFill: Array<{
        skill: string;
        reason: string;
        priority: string;
        estimatedWeeks: number;
      }>;
      learningPath: Array<{ step: string; description: string }>;
      jobDirections: Array<{
        direction: string;
        fit: string;
        reason: string;
      }>;
    };
    raw: string;
  }> {
    const { userSkills, recentMatches } = params;

    const contextParts: string[] = [];
    contextParts.push('## 候选人当前技能图谱');
    if (userSkills.length > 0) {
      // 按 category 分组便于 LLM 理解
      const grouped: Record<string, string[]> = {};
      for (const s of userSkills.slice(0, 40)) {
        const cat = s.category || '其它';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(`${s.name}[${s.proficiency}]`);
      }
      for (const [cat, items] of Object.entries(grouped)) {
        contextParts.push(`### ${cat}`);
        contextParts.push(items.join('、'));
      }
    } else {
      contextParts.push('(暂无解析到的技能)');
    }

    if (recentMatches.length > 0) {
      contextParts.push('## 最近匹配评估');
      for (const m of recentMatches.slice(0, 5)) {
        contextParts.push(
          `### ${m.jobTitle}${m.companyName ? ` @ ${m.companyName}` : ''}`,
        );
        contextParts.push(`- 匹配度: ${m.overallFit}/100`);
        contextParts.push(`- 上手周期: ${m.readinessMonths} 个月`);
        if (m.gaps.length > 0)
          contextParts.push(`- 缺失技能: ${m.gaps.join('；')}`);
        if (m.transferableSkills.length > 0) {
          contextParts.push('- 可迁移技能:');
          for (const t of m.transferableSkills.slice(0, 5))
            contextParts.push(
              `  - ${t.candidateSkill} → ${t.jobRequirement} [${t.transferability}]`,
            );
        }
      }
    } else {
      contextParts.push('## 最近匹配评估\n(暂无匹配记录)');
    }

    const userMessage = contextParts.join('\n');

    const systemPrompt = COACH_ADVICE_PROMPT;

    const rawResponse = await this.callLLMWithLog(
      'generate_explanation',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        plan: {
          summary: '',
          shortTermGoals: [],
          skillGapsToFill: [],
          learningPath: [],
          jobDirections: [],
        },
        raw: rawResponse,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
    const asStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    const asObjectArray = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v)
        ? v.filter(
            (x): x is Record<string, unknown> =>
              typeof x === 'object' && x !== null,
          )
        : [];

    const validPriorities = ['高', '中', '低'];
    const validFit = ['高', '中', '低'];

    const plan = {
      summary: asString(parsed.summary),
      shortTermGoals: asObjectArray(parsed.shortTermGoals).map((o) => ({
        goal: asString(o.goal),
        weeks: Math.min(12, Math.max(1, Number(o.weeks) || 4)),
        actions: asStringArray(o.actions),
      })),
      skillGapsToFill: asObjectArray(parsed.skillGapsToFill).map((o) => ({
        skill: asString(o.skill),
        reason: asString(o.reason),
        priority: validPriorities.includes(o.priority as string)
          ? (o.priority as string)
          : '中',
        estimatedWeeks: Math.min(
          12,
          Math.max(1, Number(o.estimatedWeeks) || 4),
        ),
      })),
      learningPath: asObjectArray(parsed.learningPath).map((o) => ({
        step: asString(o.step),
        description: asString(o.description),
      })),
      jobDirections: asObjectArray(parsed.jobDirections).map((o) => ({
        direction: asString(o.direction),
        fit: validFit.includes(o.fit as string) ? (o.fit as string) : '中',
        reason: asString(o.reason),
      })),
    };

    return { plan, raw: rawResponse };
  }

  /**
   * 智能问答：基于上下文（简历/JD/匹配结果）的多轮对话。
   * 支持流式输出，返回纯文本回复。
   */
  async chatWithContext(
    params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      contextText: string;
      docType?: 'resume' | 'job_description' | 'match';
    },
    onChunk?: (token: string) => void,
  ): Promise<string> {
    const { messages, contextText, docType } = params;

    const roleHint =
      docType === 'resume'
        ? '候选人简历'
        : docType === 'job_description'
          ? '岗位描述'
          : docType === 'match'
            ? '候选人与职位的匹配评估结果'
            : '相关文档';

    const systemPrompt = buildChatSystemPrompt(roleHint, contextText);

    // 将历史 messages 拼成单一 user message（DeepSeek 协议只支持 system+user，
    // 多轮对话通过拼接 history 实现，避免修改 callLLM 协议）
    const conversationParts: string[] = [];
    const recent = messages.slice(-6); // 最近 3 轮
    for (const m of recent) {
      const label = m.role === 'user' ? '用户' : 'AI';
      conversationParts.push(`【${label}】${m.content}`);
    }
    const userMessage = conversationParts.join('\n\n');

    return this.callLLMWithLog(
      'generate_explanation',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );
  }

  private validateProficiency(
    p: string,
  ): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const valid = ['beginner', 'intermediate', 'advanced', 'expert'];
    const lower = p?.toLowerCase();
    const map: Record<string, string> = {
      初级: 'beginner',
      入门: 'beginner',
      了解: 'beginner',
      中级: 'intermediate',
      熟悉: 'intermediate',
      高级: 'advanced',
      熟练: 'advanced',
      掌握: 'advanced',
      专家: 'expert',
      精通: 'expert',
      擅长: 'expert',
    };
    const mapped = map[lower] || lower;
    return valid.includes(mapped)
      ? (mapped as 'beginner' | 'intermediate' | 'advanced' | 'expert')
      : 'intermediate';
  }
}
