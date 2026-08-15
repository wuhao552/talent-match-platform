import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmLog } from './llm-log.entity';

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
   * 技能提取 — 简单任务，用 flash 模型
   */
  async extractSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个技能提取专家。从给定的简历文本中提取所有技能标签，并评估熟练度。

## 核心规则：标准化规范化提取

1. **双层提取**：对于每个提到的具体工具/框架，同时提取它所属的**领域技能**。
   - 例："使用PyTorch搭建ResNet模型" → 提取 "PyTorch"（具体工具）AND "深度学习"（领域）
   - 例："用React开发前端" → 提取 "React"（框架）AND "前端开发"（领域）
   - 例："熟练使用Excel进行数据分析" → 提取 "Excel"（工具）AND "数据分析"（领域）

2. **规范化命名**：
   - 技术工具/框架用英文原名：Python, PyTorch, React, Docker, PostgreSQL
   - 领域/概念用中文：深度学习, 自然语言处理, 计算机视觉, 前端开发, 数据库设计
   - 行业技能用中文：门店运营管理, 税务筹划, 护理评估, 投资分析
   - 避免冗余后缀：不要加"技术"、"开发"、"框架"等通用后缀

3. **抽象层级**：
   - 如果文本只提到领域（如"深度学习"），提取"深度学习"
   - 如果文本提到具体工具（如"PyTorch"），同时提取工具名和领域
   - 不要遗漏隐含技能：如"3年K8s运维经验" → "Kubernetes" + "容器编排" + "DevOps"

4. **行业通用**：适用于IT、医疗、金融、零售、制造、教育等所有行业

返回纯JSON数组，格式：[{"name":"技能名","proficiency":"熟练度"}]
proficiency必须是以下之一：beginner, intermediate, advanced, expert
如果没有提取到技能，返回空数组 []`;

    const userMessage = `请从以下文本中提取技能：\n\n${text.slice(0, 8000)}`;

    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      'extractSkills',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    const latencyMs = Date.now() - startTime;

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      proficiency: string;
    }>;

    const skills: ExtractedSkill[] = parsed.map((s) => ({
      name: s.name,
      proficiency: this.validateProficiency(s.proficiency),
      confidence: 0.95,
      sourceText: '',
    }));

    return {
      skills,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: { skills },
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    };
  }

  async parseDocument(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个文档解析专家。从给定的简历或职位描述中提取结构化信息。
返回纯JSON对象，包含以下字段：
- name: 姓名
- email: 邮箱
- phone: 手机号码
- city: 所在城市
- title: 当前职位/标题
- summary: 个人简介或职位概述(一段话)
- education: 教育背景(数组,每项含school/major/degree/year)
- experience: 工作经历(数组,每项含company/title/duration/description)
如果没有提取到信息，对应字段为null`;

    const userMessage = `请解析以下文档：\n\n${text.slice(0, 8000)}`;

    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      'parseDocument',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    const latencyMs = Date.now() - startTime;

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 文档解析返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      parsed,
      detail: {
        model: this.flashModel,
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
   * 岗位描述解析 — 企业端专用，提取字段与简历完全不同
   */
  async parseJobDescription(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ parsed: Record<string, unknown>; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个招聘岗位分析专家。从给定的岗位描述(JD)中提取结构化信息。
返回纯JSON对象，包含以下字段：
- companyName: 公司名称
- companyIndustry: 所属行业
- companySize: 公司规模(如"50-200人"、"1000人以上")
- jobTitle: 岗位名称
- department: 所属部门
- location: 工作地点(城市/区域)
- salaryRange: 薪资范围(如"15k-25k"、"面议")
- jobType: 工作类型(全职/兼职/实习/外包)
- experienceRequired: 经验要求(如"1-3年"、"5年以上")
- educationRequired: 学历要求(如"本科"、"硕士及以上")
- responsibilities: 岗位职责(字符串数组，每项一句话)
- requirements: 任职要求(字符串数组，每项一句话)
- benefits: 福利待遇(字符串数组)
- summary: 岗位概述(一段话)
如果没有提取到信息，对应字段为null`;

    const userMessage = `请解析以下岗位描述：\n\n${text.slice(0, 8000)}`;

    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      'parseJobDescription',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    const latencyMs = Date.now() - startTime;

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 岗位解析返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      parsed,
      detail: {
        model: this.flashModel,
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
   * 岗位技能提取 — 企业端专用，提取任职要求中的技能及期望熟练度
   */
  async extractJobSkills(
    text: string,
    onChunk?: (token: string) => void,
  ): Promise<{ skills: ExtractedSkill[]; detail: LlmCallDetail }> {
    const systemPrompt = `你是一个招聘需求分析专家。从岗位描述中提取所有要求/期望的技能，并评估该岗位对每项技能的熟练度要求。

## 核心规则：标准化规范化提取

1. **双层提取**：对每个提到的具体要求，同时提取它所属的**领域技能**。
   - 例："熟悉PyTorch或TensorFlow" → 提取 "PyTorch", "TensorFlow", "深度学习"
   - 例："有React或Vue开发经验" → 提取 "React", "Vue", "前端开发"
   - 例："具备税务筹划能力" → 提取 "税务筹划"

2. **规范化命名**（与简历端使用相同规范，确保名称能直接匹配）：
   - 技术工具/框架用英文原名：Python, PyTorch, React, Docker, PostgreSQL
   - 领域/概念用中文：深度学习, 自然语言处理, 计算机视觉, 前端开发, 数据库设计
   - 行业技能用中文：门店运营管理, 税务筹划, 护理评估, 投资分析
   - 避免冗余后缀：不要加"技术"、"开发"、"框架"等通用后缀

3. **抽象层级**：
   - 如果JD只要求领域（如"深度学习相关经验"），提取"深度学习"
   - 如果JD要求具体工具（如"熟练使用PyTorch"），同时提取工具和领域
   - 从上下文推断隐含技能

4. **行业通用**：适用于IT、医疗、金融、零售、制造、教育等所有行业

返回纯JSON数组，格式：[{"name":"技能名","proficiency":"熟练度"}]
proficiency必须是以下之一：beginner, intermediate, advanced, expert
注意：请区分"必备技能"和"加分技能"——必备技能通常对应advanced/expert，加分技能通常对应beginner/intermediate。
如果岗位描述中没有明确的技能要求，返回空数组 []`;

    const userMessage = `请从以下岗位描述中提取技能要求：\n\n${text.slice(0, 8000)}`;

    const startTime = Date.now();
    const rawResponse = await this.callLLMWithLog(
      'extractJobSkills',
      systemPrompt,
      userMessage,
      this.flashModel,
      onChunk,
    );

    const latencyMs = Date.now() - startTime;

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(
        `LLM 岗位技能提取返回格式无法解析，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      proficiency: string;
    }>;

    const skills: ExtractedSkill[] = parsed.map((s) => ({
      name: s.name,
      proficiency: this.validateProficiency(s.proficiency),
      confidence: 0.95,
      sourceText: '',
    }));

    return {
      skills,
      detail: {
        model: this.flashModel,
        systemPrompt,
        userMessage,
        rawResponse,
        parsedResult: { skills },
        success: true,
        tokensUsed: undefined,
        latencyMs,
      },
    };
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

  async callLLMForJson(
    systemPrompt: string,
    userMessage: string,
    model?: string,
  ): Promise<Record<string, unknown>> {
    const raw = await this.callLLM(
      systemPrompt,
      userMessage,
      model || this.flashModel,
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM JSON 解析失败，原始响应: ${raw.slice(0, 300)}`);
    }
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Streaming version: emits tokens via onChunk, then returns parsed JSON array.
   */
  async callLLMForJsonArrayStream(
    systemPrompt: string,
    userMessage: string,
    onChunk?: (token: string) => void,
    model?: string,
  ): Promise<Record<string, unknown>[]> {
    let rawResponse = '';

    if (onChunk) {
      for await (const chunk of this.callLLMStream(
        systemPrompt,
        userMessage,
        model || this.flashModel,
      )) {
        if (!chunk.done) onChunk(chunk.token);
        rawResponse = chunk.fullText;
      }
    } else {
      rawResponse = await this.callLLM(
        systemPrompt,
        userMessage,
        model || this.flashModel,
      );
    }

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(
        `LLM JSON 数组解析失败，原始响应: ${rawResponse.slice(0, 300)}`,
      );
    }
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
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

    const systemPrompt = `你是一位资深技术面试官和人才评估专家。基于候选人与职位的匹配信息，生成一份定制化的面试问题清单。

## 出题原则
1. **围绕优势出深度题**：候选人 strengths 中的技能，出能考察真实深度的进阶题
2. **围绕差距出探测题**：候选人 gaps 中的技能，出能识别真实水平的探底题（避免直接问"你会不会"，而是出场景题）
3. **围绕可迁移技能出迁移题**：考察候选人将已有技能迁移到新领域的能力
4. **加入 1-2 道行为/项目题**：基于简历经历考察软实力和工程素养

## 输出要求
返回纯 JSON 数组，每项是一道面试题：
[
  {
    "category": "技术深度|差距探测|迁移能力|行为项目",
    "difficulty": "基础|进阶|压栈",
    "question": "面试题完整描述（含必要的场景背景）",
    "intent": "出题意图（要考察什么能力/知识，期望听到的关键点）",
    "referenceAnswer": "参考答案要点（3-5 条，简明）",
    "skillTag": "关联的技能名（如 React/系统设计/沟通协作）"
  }
]

## 数量
共 6-8 道题，覆盖四个 category，难度梯度合理。`;

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

    const systemPrompt = `你是一位拥有 10 年经验的职业发展教练，专注于技术人才的成长路径规划。基于候选人的当前技能图谱和最近的匹配评估结果，输出一份个性化的职业成长计划。

## 输出要求
返回纯 JSON 对象：
{
  "summary": "200 字内的整体诊断：当前能力定位、主要短板、最值得发力的方向",
  "shortTermGoals": [
    {
      "goal": "短期目标（1-3 个月内可达成，具体可执行）",
      "weeks": 4-12,
      "actions": ["具体行动 1", "具体行动 2", "具体行动 3"]
    }
  ],
  "skillGapsToFill": [
    {
      "skill": "需补齐的技能名",
      "reason": "为什么补这项（来自最近匹配评估中的 gaps）",
      "priority": "高|中|低",
      "estimatedWeeks": 2-12
    }
  ],
  "learningPath": [
    {
      "step": "学习步骤标题",
      "description": "该步骤的具体内容，含建议的学习方式（项目/课程/源码阅读等）"
    }
  ],
  "jobDirections": [
    {
      "direction": "推荐的岗位方向",
      "fit": "高|中|低",
      "reason": "为什么这个方向适合（结合候选人现有技能和可迁移能力）"
    }
  ]
}

## 规则
- shortTermGoals 2-3 个，每个 3-5 条 actions
- skillGapsToFill 3-5 项，优先级合理（不能全是高）
- learningPath 4-6 步，按由浅入深顺序
- jobDirections 2-3 个方向，至少一个跨界方向（利用 transferableSkills）
- 所有建议必须基于候选人的真实技能和匹配记录，不要泛泛而谈`;

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

    const systemPrompt = `你是人才匹配平台的 AI 助手。用户（候选人或 HR）会基于已有的${roleHint}数据向你提问。

## 你的回答原则
1. **基于上下文回答**：必须依据下方提供的"上下文数据"作答，不要编造未提供的信息
2. **诚实透明**：上下文中没有的信息，明确说"根据当前数据无法判断"，不要瞎编
3. **专业客观**：用招聘/职业发展专业视角解读数据，给出有洞察的判断
4. **结构化输出**：长回答用 Markdown 列表/分点呈现，便于阅读
5. **中英文混排**：技术术语保留英文原名（如 React、Kubernetes）

## 上下文数据
${contextText.slice(0, 6000)}

## 注意
- 如果用户提问与上下文无关（如闲聊），礼貌引导回正题
- 涉及薪资、岗位竞争力的判断要谨慎，作为参考而非定论`;

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
