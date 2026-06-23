import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { DocumentSkill } from '../skill/document-skill.entity';
import { Skill } from '../skill/skill.entity';
import { Document } from '../document/document.entity';
import { User } from '../user/user.entity';
import type {
  LlmAssessment,
  AlgorithmStep,
} from './match-result.entity';

@Injectable()
export class LlmMatchingService {
  constructor(
    private llm: LlmService,
  ) {}

  async assessMatch(params: {
    resumeDoc: Document;
    jobDoc: Document;
    resumeSkills: DocumentSkill[];
    jobSkills: DocumentSkill[];
    skillMetaMap: Map<number, Skill>;
    person?: User | null;
    company?: User | null;
    matchDetails: Array<{
      skillName: string;
      personProficiency: string;
      jobRequirement: string;
    }>;
  }): Promise<{
    assessment: LlmAssessment;
    step: AlgorithmStep;
  }> {
    const t0 = Date.now();

    const context = this.buildMixedContext(params);

    const systemPrompt = `你是一位拥有10年经验的资深猎头顾问和技术人才评估专家。你的任务是对候选人与职位进行**全方位深度匹配评估**。

## 评估维度（请逐一分析）

1. **核心技能匹配**: 直接匹配的技能有哪些？熟练度是否达标？
2. **可迁移技能**: 候选人有哪些技能可以迁移到目标职位？迁移难度如何？
3. **成长潜力**: 基于候选人的技能栈和学习轨迹，达到完全胜任需要多长时间？
4. **经验匹配**: 工作年限、项目经验、行业背景是否匹配？
5. **互补价值**: 候选人能为团队带来哪些额外的能力或视角？

## 评分标准（请严格遵守）
- 90-100: 高度匹配，可立即上岗
- 75-89: 良好匹配，短期适应即可
- 60-74: 基本匹配，需要一定学习期
- 40-59: 部分匹配，需要较长学习期
- 0-39: 匹配度低，不建议

## 评分原则（非常重要）
- **overallFit 评分仅反映技术能力与职位要求的匹配程度**，即候选人能否胜任该职位的技术工作
- 薪资期望、工作地点、职级等非技术因素**不得**作为扣分项降低 overallFit
- 非技术因素（如薪资差距、地点偏好）应在 reasoning 中作为风险提示单独说明，但不应降低技术匹配评分
- 候选人技术能力**超过**职位要求时，overallFit 不应因此降低——能力溢出是优势而非劣势

## 输出要求
返回严格的JSON格式：
{
  "overallFit": 0-100的技术匹配分（仅反映技术能力与职位要求的匹配程度）,
  "strengths": ["匹配优势1", "匹配优势2", "匹配优势3"],
  "gaps": ["技术差距1", "技术差距2"],
  "transferableSkills": [
    {"candidateSkill": "候选人技能", "jobRequirement": "对应职位要求", "transferability": "high/medium/low", "reasoning": "原因"}
  ],
  "readinessMonths": 0-12,
  "confidence": 0.0-1.0,
  "reasoning": "300字以内的综合评估理由，涵盖技术匹配分析；如有薪资、地点等非技术风险因素，在末尾以'风险提示：'单独列出，但不影响 overallFit 评分"
}`;

    let rawResponse: string;
    try {
      rawResponse = await this.llm.callLLM(systemPrompt, context, undefined);
    } catch (err) {
      const fallback: LlmAssessment = {
        overallFit: 0,
        strengths: [],
        gaps: ['LLM评估不可用'],
        transferableSkills: [],
        readinessMonths: 0,
        confidence: 0,
        reasoning: `LLM评估失败: ${(err as Error).message}`,
      };
      return {
        assessment: fallback,
        step: {
          phase: 'llm_assessment',
          label: 'LLM 深度评估',
          status: 'error',
          durationMs: Date.now() - t0,
          summary: `评估失败: ${(err as Error).message}`,
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      parsed = {};
    }

    const assessment: LlmAssessment = {
      overallFit: Math.min(100, Math.max(0, Number(parsed.overallFit) || 0)),
      strengths: Array.isArray(parsed.strengths)
        ? (parsed.strengths as string[])
        : [],
      gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : [],
      transferableSkills: Array.isArray(parsed.transferableSkills)
        ? parsed.transferableSkills.map((t) => ({
            candidateSkill: String(t.candidateSkill || ''),
            jobRequirement: String(t.jobRequirement || ''),
            transferability: (['high', 'medium', 'low'].includes(
              t.transferability,
            )
              ? t.transferability
              : 'low') as 'high' | 'medium' | 'low',
            reasoning: String(t.reasoning || ''),
          }))
        : [],
      readinessMonths: Math.min(
        12,
        Math.max(0, Number(parsed.readinessMonths) || 0),
      ),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || ''),
    };

    return {
      assessment,
      step: {
        phase: 'llm_assessment',
        label: 'LLM 深度评估',
        status: 'done',
        durationMs: Date.now() - t0,
        summary: `匹配度 ${assessment.overallFit}/100, 置信度 ${(assessment.confidence * 100).toFixed(0)}%, ${assessment.strengths.length} 项优势, ${assessment.gaps.length} 项差距`,
        data: {
          overallFit: assessment.overallFit,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
        },
      },
    };
  }

  /**
   * Streaming version of assessMatch — emits LLM tokens and progress via callbacks.
   * Used by the SSE pipeline endpoint for real-time visibility.
   */
  async assessMatchStream(
    params: {
      resumeDoc: Document;
      jobDoc: Document;
      resumeSkills: DocumentSkill[];
      jobSkills: DocumentSkill[];
      skillMetaMap: Map<number, Skill>;
      person?: User | null;
      company?: User | null;
      matchDetails: Array<{
        skillName: string;
        personProficiency: string;
        jobRequirement: string;
      }>;
    },
    onProgress: (step: {
      phase: string;
      label: string;
      status: string;
      summary: string;
      data?: Record<string, unknown>;
    }) => void,
    onChunk: (agent: string, token: string) => void,
    onPrompt?: (
      agent: string,
      systemPrompt: string,
      userMessage: string,
    ) => void,
  ): Promise<{
    assessment: LlmAssessment;
    step: AlgorithmStep;
  }> {
    const t0 = Date.now();

    onProgress({
      phase: 'context_assembly',
      label: '组装匹配上下文',
      status: 'running',
      summary: '正在组装匹配上下文...',
    });
    const context = this.buildMixedContext(params);
    onProgress({
      phase: 'context_assembly',
      label: '组装匹配上下文',
      status: 'done',
      summary: `上下文长度: ${context.length} 字符`,
    });

    const systemPrompt = `你是一位拥有10年经验的资深猎头顾问和技术人才评估专家。你的任务是对候选人与职位进行**全方位深度匹配评估**。

## 评估维度（请逐一分析）

1. **核心技能匹配**: 直接匹配的技能有哪些？熟练度是否达标？
2. **可迁移技能**: 候选人有哪些技能可以迁移到目标职位？迁移难度如何？
3. **成长潜力**: 基于候选人的技能栈和学习轨迹，达到完全胜任需要多长时间？
4. **经验匹配**: 工作年限、项目经验、行业背景是否匹配？
5. **互补价值**: 候选人能为团队带来哪些额外的能力或视角？

## 评分标准（请严格遵守）
- 90-100: 高度匹配，可立即上岗
- 75-89: 良好匹配，短期适应即可
- 60-74: 基本匹配，需要一定学习期
- 40-59: 部分匹配，需要较长学习期
- 0-39: 匹配度低，不建议

## 评分原则（非常重要）
- **overallFit 评分仅反映技术能力与职位要求的匹配程度**，即候选人能否胜任该职位的技术工作
- 薪资期望、工作地点、职级等非技术因素**不得**作为扣分项降低 overallFit
- 非技术因素（如薪资差距、地点偏好）应在 reasoning 中作为风险提示单独说明，但不应降低技术匹配评分
- 候选人技术能力**超过**职位要求时，overallFit 不应因此降低——能力溢出是优势而非劣势

## 输出要求
返回严格的JSON格式：
{
  "overallFit": 0-100的技术匹配分（仅反映技术能力与职位要求的匹配程度）,
  "strengths": ["匹配优势1", "匹配优势2", "匹配优势3"],
  "gaps": ["技术差距1", "技术差距2"],
  "transferableSkills": [
    {"candidateSkill": "候选人技能", "jobRequirement": "对应职位要求", "transferability": "high/medium/low", "reasoning": "原因"}
  ],
  "readinessMonths": 0-12,
  "confidence": 0.0-1.0,
  "reasoning": "300字以内的综合评估理由，涵盖技术匹配分析；如有薪资、地点等非技术风险因素，在末尾以'风险提示：'单独列出，但不影响 overallFit 评分"
}`;

    // Emit prompt so frontend can display it
    if (onPrompt) onPrompt('llm_assessment', systemPrompt, context);

    onProgress({
      phase: 'llm_assessment',
      label: 'LLM 深度评估',
      status: 'running',
      summary: '正在调用大模型进行匹配评估...',
    });

    let rawResponse: string;
    try {
      rawResponse = '';
      for await (const chunk of this.llm.callLLMStream(
        systemPrompt,
        context,
        process.env.LLM_MODEL || 'deepseek-v4-flash',
      )) {
        if (!chunk.done) onChunk('llm_assessment', chunk.token);
        rawResponse = chunk.fullText;
      }
    } catch (err) {
      const fallback: LlmAssessment = {
        overallFit: 0,
        strengths: [],
        gaps: ['LLM评估不可用'],
        transferableSkills: [],
        readinessMonths: 0,
        confidence: 0,
        reasoning: `LLM评估失败: ${(err as Error).message}`,
      };
      return {
        assessment: fallback,
        step: {
          phase: 'llm_assessment',
          label: 'LLM 深度评估',
          status: 'error',
          durationMs: Date.now() - t0,
          summary: `评估失败: ${(err as Error).message}`,
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      parsed = {};
    }

    const assessment: LlmAssessment = {
      overallFit: Math.min(100, Math.max(0, Number(parsed.overallFit) || 0)),
      strengths: Array.isArray(parsed.strengths)
        ? (parsed.strengths as string[])
        : [],
      gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : [],
      transferableSkills: Array.isArray(parsed.transferableSkills)
        ? parsed.transferableSkills.map((t) => ({
            candidateSkill: String(t.candidateSkill || ''),
            jobRequirement: String(t.jobRequirement || ''),
            transferability: (['high', 'medium', 'low'].includes(
              t.transferability,
            )
              ? t.transferability
              : 'low') as 'high' | 'medium' | 'low',
            reasoning: String(t.reasoning || ''),
          }))
        : [],
      readinessMonths: Math.min(
        12,
        Math.max(0, Number(parsed.readinessMonths) || 0),
      ),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || ''),
    };

    onProgress({
      phase: 'llm_assessment',
      label: 'LLM 深度评估',
      status: 'done',
      summary: `匹配度 ${assessment.overallFit}/100, 置信度 ${(assessment.confidence * 100).toFixed(0)}%`,
    });

    return {
      assessment,
      step: {
        phase: 'llm_assessment',
        label: 'LLM 深度评估',
        status: 'done',
        durationMs: Date.now() - t0,
        summary: `匹配度 ${assessment.overallFit}/100, 置信度 ${(assessment.confidence * 100).toFixed(0)}%, ${assessment.strengths.length} 项优势, ${assessment.gaps.length} 项差距`,
        data: {
          overallFit: assessment.overallFit,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
        },
      },
    };
  }

  private buildMixedContext(
    params: {
      resumeDoc: Document;
      jobDoc: Document;
      resumeSkills: DocumentSkill[];
      jobSkills: DocumentSkill[];
      skillMetaMap: Map<number, Skill>;
      person?: User | null;
      company?: User | null;
      matchDetails: Array<{
        skillName: string;
        personProficiency: string;
        jobRequirement: string;
      }>;
    },
  ): string {
    const s: string[] = [];

    // Skill tables
    s.push('## 候选人技能列表');
    for (const ds of params.resumeSkills) {
      const cat = params.skillMetaMap.get(ds.skillId)?.category;
      s.push(
        `- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`,
      );
    }
    s.push('## 职位要求技能列表');
    for (const ds of params.jobSkills) {
      const cat = params.skillMetaMap.get(ds.skillId)?.category;
      s.push(
        `- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`,
      );
    }

    // Match details
    if (params.matchDetails.length > 0) {
      s.push('## 已匹配的技能');
      for (const d of params.matchDetails.slice(0, 15))
        s.push(
          `- ${d.skillName}: 候选人[${d.personProficiency}] → 职位要求[${d.jobRequirement}]`,
        );
    }

    // Gap analysis: job skills not matched by any resume skill
    const matchedJobSkillNames = new Set(
      params.matchDetails.map(
        (d) => d.skillName.split(' ↔ ').pop() || d.skillName,
      ),
    );
    const unmatchedJobSkills = params.jobSkills.filter((ds) => {
      const name = ds.skillName || ds.skill?.name || '';
      return !matchedJobSkillNames.has(name);
    });
    if (unmatchedJobSkills.length > 0) {
      s.push('## ⚠️ 未匹配的职位要求（候选人缺失的技能）');
      for (const ds of unmatchedJobSkills) {
        const cat = params.skillMetaMap.get(ds.skillId)?.category;
        s.push(
          `- ${ds.skillName || ds.skill?.name} [要求: ${ds.proficiency}]${cat ? ` (${cat})` : ''}`,
        );
      }
    }

    // Raw text excerpts
    const resumeText = this.extractKeyText(
      String(params.resumeDoc.parsedText || ''),
      2000,
    );
    const jobText = this.extractKeyText(
      String(params.jobDoc.parsedText || ''),
      2000,
    );
    if (resumeText) s.push(`## 简历关键信息\n${resumeText}`);
    if (jobText) s.push(`## 职位描述关键信息\n${jobText}`);

    // City
    const rc = params.person?.city || '',
      jc = params.company?.city || '';
    if (rc || jc)
      s.push(`## 地理信息\n- 候选人: ${rc || '未知'}\n- 职位: ${jc || '未知'}`);

    return s.join('\n');
  }

  private extractKeyText(text: string, max: number): string {
    if (!text || text.length <= max) return text;
    const t = text.slice(0, max);
    const p = Math.max(t.lastIndexOf('。'), t.lastIndexOf('\n'));
    return p > max * 0.5 ? t.slice(0, p + 1) : t + '...';
  }

  /**
   * 多文档对评估：对每个文档对独立发起一次 LLM 调用，且**并发执行**。
   *
   * 之前此方法会把多个文档对合并到一个 prompt 中（Map-Reduce），但实测会导致 LLM
   * 输出趋同（例如所有对都给 ~95 分）——因为多个候选的上下文混在一起，模型无法
   * 针对每一对单独、严肃地评分。现已改为逐对独立调用 `assessMatchStream`，确保每
   * 个文档对拿到专属的 prompt 和独立的、有区分度的评分。
   *
   * 各文档对之间无依赖，因此用 `Promise.allSettled` 并发执行；单对失败不影响其它对。
   * 回调在每个 worker 内绑定到本对的 resumeId/jobId，前端会据此把进度/流式 token/
   * prompt 正确路由到对应的匹配卡片。
   *
   * 注意：传入的回调由调用方负责绑定到具体的 resumeId/jobId（见
   * MatchingService.calculateBatchMatchStream），因此每对的事件都会正确路由到前端
   * 对应的匹配卡片。
   */
  async assessBatchStream(
    pairs: Array<{
      resumeDoc: Document;
      jobDoc: Document;
      resumeSkills: DocumentSkill[];
      jobSkills: DocumentSkill[];
      skillMetaMap: Map<number, Skill>;
      person?: User | null;
      company?: User | null;
      matchDetails: Array<{
        skillName: string;
        personProficiency: string;
        jobRequirement: string;
      }>;
      resumeId?: string;
      jobId?: string;
    }>,
    onProgress: (
      step: {
        phase: string;
        label: string;
        status: string;
        summary: string;
        data?: Record<string, unknown>;
      },
      resumeId: string,
      jobId: string,
    ) => void,
    onChunk: (
      agent: string,
      token: string,
      resumeId: string,
      jobId: string,
    ) => void,
    onPrompt?: (
      agent: string,
      systemPrompt: string,
      userMessage: string,
      resumeId: string,
      jobId: string,
    ) => void,
  ): Promise<
    Array<{
      assessment: LlmAssessment;
      step: AlgorithmStep;
    }>
  > {
    if (pairs.length === 0) return [];

    const runOne = (p: (typeof pairs)[number]) => {
      const resumeId = p.resumeId || '';
      const jobId = p.jobId || '';
      // 每个文档对独立调用一次 LLM，使用独立的 prompt 与上下文；回调绑定到本对的 resumeId/jobId
      return this.assessMatchStream(
        p,
        (step) => onProgress(step, resumeId, jobId),
        (agent, token) => onChunk(agent, token, resumeId, jobId),
        onPrompt
          ? (agent, systemPrompt, userMessage) =>
              onPrompt(agent, systemPrompt, userMessage, resumeId, jobId)
          : undefined,
      );
    };

    // 并发执行：各对无依赖。settled 顺序与 pairs 对齐，单对失败不影响其它对。
    const settled = await Promise.allSettled(pairs.map((p) => runOne(p)));

    // 还原成与入参对齐的结果数组；失败的对回填一个 error step，保持索引一致。
    const results: Array<{
      assessment: LlmAssessment;
      step: AlgorithmStep;
    }> = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        const errMsg = (r.reason as Error)?.message || String(r.reason);
        const fallback: LlmAssessment = {
          overallFit: 0,
          strengths: [],
          gaps: ['LLM评估不可用'],
          transferableSkills: [],
          readinessMonths: 0,
          confidence: 0,
          reasoning: `LLM评估失败: ${errMsg}`,
        };
        results.push({
          assessment: fallback,
          step: {
            phase: 'llm_assessment',
            label: 'LLM 深度评估',
            status: 'error',
            durationMs: 0,
            summary: `评估失败: ${errMsg}`,
          },
        });
      }
    }
    return results;
  }
}
