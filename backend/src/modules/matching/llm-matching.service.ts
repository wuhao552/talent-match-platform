import { Injectable } from '@nestjs/common'
import { LlmService } from '../llm/llm.service'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { Document } from '../document/document.entity'
import { User } from '../user/user.entity'
import { SkillSimilarityService } from '../skill/skill-similarity.service'
import type { LlmAssessment, CommunityContext, AlgorithmStep } from './match-result.entity'

@Injectable()
export class LlmMatchingService {
  constructor(
    private llm: LlmService,
    private skillSimilarity: SkillSimilarityService,
  ) {}

  /**
   * GraphRAG-style LLM matching assessment.
   * Assembles mixed context (skills + community reports + raw text) and asks LLM to evaluate.
   */
  async assessMatch(params: {
    resumeDoc: Document
    jobDoc: Document
    resumeSkills: DocumentSkill[]
    jobSkills: DocumentSkill[]
    skillMetaMap: Map<number, Skill>
    person?: User | null
    company?: User | null
    algorithmScore: number  // Kept for context but not used as primary score
    matchDetails: Array<{ skillName: string; score: number; personProficiency: string; jobRequirement: string }>
  }): Promise<{ assessment: LlmAssessment; communityContext: CommunityContext; step: AlgorithmStep }> {
    const t0 = Date.now()

    // ── Step 1: Build community context ──
    const communityContext = this.buildCommunityContext(
      params.resumeSkills, params.jobSkills, params.skillMetaMap,
    )

    // ── Step 2: Build mixed context (GraphRAG style) ──
    const context = this.buildMixedContext(params, communityContext)

    // ── Step 3: LLM assessment ──
    const systemPrompt = `你是一位拥有10年经验的资深猎头顾问和技术人才评估专家。你的任务是对候选人与职位进行**全方位深度匹配评估**。

## 评估维度（请逐一分析）

1. **核心技能匹配**: 直接匹配的技能有哪些？熟练度是否达标？
2. **可迁移技能**: 候选人有哪些技能可以迁移到目标职位？迁移难度如何？
3. **成长潜力**: 基于候选人的技能栈和学习轨迹，达到完全胜任需要多长时间？
4. **经验匹配**: 工作年限、项目经验、行业背景是否匹配？
5. **地理因素**: 候选人城市与职位城市是否匹配？是否有异地风险？
6. **互补价值**: 候选人能为团队带来哪些额外的能力或视角？

## 评分标准（请严格遵守）
- 90-100: 高度匹配，可立即上岗
- 75-89: 良好匹配，短期适应即可
- 60-74: 基本匹配，需要一定学习期
- 40-59: 部分匹配，需要较长学习期
- 0-39: 匹配度低，不建议

## 输出要求
返回严格的JSON格式：
{
  "overallFit": 0-100的综合匹配分,
  "strengths": ["匹配优势1", "匹配优势2", "匹配优势3"],
  "gaps": ["差距1", "差距2"],
  "transferableSkills": [
    {"candidateSkill": "候选人技能", "jobRequirement": "对应职位要求", "transferability": "high/medium/low", "reasoning": "原因"}
  ],
  "readinessMonths": 0-12,
  "confidence": 0.0-1.0,
  "reasoning": "300字以内的综合评估理由，需要涵盖上述6个维度的分析"
}`

    let rawResponse: string
    try {
      rawResponse = await this.llm.callLLM(systemPrompt, context, undefined)
    } catch (err) {
      const fallback: LlmAssessment = {
        overallFit: 0,
        strengths: [],
        gaps: ['LLM评估不可用'],
        transferableSkills: [],
        readinessMonths: 0,
        confidence: 0,
        reasoning: `LLM评估失败: ${(err as Error).message}`,
      }
      return {
        assessment: fallback, communityContext,
        step: { phase: 'llm_assessment', label: 'LLM 深度评估', status: 'error', durationMs: Date.now() - t0, summary: `评估失败: ${(err as Error).message}` },
      }
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawResponse.match(/\{[\s\S]*\}/)?.[0] || '{}')
    } catch { parsed = {} }

    const assessment: LlmAssessment = {
      overallFit: Math.min(100, Math.max(0, Number(parsed.overallFit) || 0)),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths as string[] : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps as string[] : [],
      transferableSkills: Array.isArray(parsed.transferableSkills)
        ? (parsed.transferableSkills as any[]).map(t => ({
            candidateSkill: String(t.candidateSkill || ''),
            jobRequirement: String(t.jobRequirement || ''),
            transferability: (['high', 'medium', 'low'].includes(t.transferability) ? t.transferability : 'low') as 'high' | 'medium' | 'low',
            reasoning: String(t.reasoning || ''),
          }))
        : [],
      readinessMonths: Math.min(12, Math.max(0, Number(parsed.readinessMonths) || 0)),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || ''),
    }

    const step: AlgorithmStep = {
      phase: 'llm_assessment',
      label: 'LLM 深度评估',
      status: 'done',
      durationMs: Date.now() - t0,
      summary: `匹配度 ${assessment.overallFit}/100, 置信度 ${(assessment.confidence * 100).toFixed(0)}%, ${assessment.strengths.length} 项优势, ${assessment.gaps.length} 项差距`,
      data: {
        overallFit: assessment.overallFit,
        confidence: assessment.confidence,
        strengthsCount: assessment.strengths.length,
        gapsCount: assessment.gaps.length,
        transferableCount: assessment.transferableSkills.length,
        readinessMonths: assessment.readinessMonths,
        reasoning: assessment.reasoning,
      },
    }

    return { assessment, communityContext, step }
  }

  /**
   * Build community context — similar to GraphRAG's community report assembly.
   * Groups skills by their communities and creates summary context.
   */
  private buildCommunityContext(
    resumeSkills: DocumentSkill[],
    jobSkills: DocumentSkill[],
    skillMetaMap: Map<number, Skill>,
  ): CommunityContext {
    // Group resume skills by community
    const resumeCommGroups = this.groupByCommunity(resumeSkills, skillMetaMap)
    const jobCommGroups = this.groupByCommunity(jobSkills, skillMetaMap)

    // Find domain overlap
    const resumeDomains = new Set(resumeCommGroups.map(c => c.skillDomain))
    const jobDomains = new Set(jobCommGroups.map(c => c.skillDomain))
    const domainOverlap = [...resumeDomains].filter(d => jobDomains.has(d))

    return {
      resumeCommunities: resumeCommGroups,
      jobCommunities: jobCommGroups,
      domainOverlap,
    }
  }

  private groupByCommunity(
    skills: DocumentSkill[],
    skillMetaMap: Map<number, Skill>,
  ): Array<{ title: string; summary: string; skillDomain: string }> {
    const groups = new Map<number, { skills: string[]; categories: Set<string> }>()

    for (const ds of skills) {
      const communityId = this.skillSimilarity.getCommunity(ds.skillId)
      if (communityId === -1) continue
      if (!groups.has(communityId)) groups.set(communityId, { skills: [], categories: new Set() })
      const g = groups.get(communityId)!
      g.skills.push(ds.skillName || ds.skill?.name || `skill-${ds.skillId}`)
      const cat = skillMetaMap.get(ds.skillId)?.category
      if (cat) g.categories.add(cat)
    }

    return [...groups.entries()].map(([commId, g]) => {
      const domain = g.categories.size > 0 ? [...g.categories][0] : '通用技能'
      return {
        title: `技能社区 #${commId} (${domain})`,
        summary: `包含 ${g.skills.length} 个技能: ${g.skills.slice(0, 8).join(', ')}${g.skills.length > 8 ? '...' : ''}`,
        skillDomain: domain,
      }
    })
  }

  /**
   * Build mixed context — GraphRAG style token-budget allocation:
   * 50% raw text, 25% skill tables, 15% community context, 10% algorithm results
   */
  private buildMixedContext(
    params: {
      resumeDoc: Document
      jobDoc: Document
      resumeSkills: DocumentSkill[]
      jobSkills: DocumentSkill[]
      skillMetaMap: Map<number, Skill>
      person?: User | null
      company?: User | null
      algorithmScore: number
      matchDetails: Array<{ skillName: string; score: number; personProficiency: string; jobRequirement: string }>
    },
    communityContext: CommunityContext,
  ): string {
    const sections: string[] = []

    // ── Section 1: Community context (15%) ──
    if (communityContext.resumeCommunities.length > 0 || communityContext.jobCommunities.length > 0) {
      sections.push(`## 技能社区分析`)
      if (communityContext.resumeCommunities.length > 0) {
        sections.push(`### 候选人技能社区`)
        communityContext.resumeCommunities.forEach(c => {
          sections.push(`- **${c.title}**: ${c.summary}`)
        })
      }
      if (communityContext.jobCommunities.length > 0) {
        sections.push(`### 职位技能社区`)
        communityContext.jobCommunities.forEach(c => {
          sections.push(`- **${c.title}**: ${c.summary}`)
        })
      }
      if (communityContext.domainOverlap.length > 0) {
        sections.push(`### 领域重叠: ${communityContext.domainOverlap.join(', ')}`)
      }
    }

    // ── Section 2: Skill tables (25%) ──
    sections.push(`## 候选人技能列表`)
    for (const ds of params.resumeSkills) {
      const cat = params.skillMetaMap.get(ds.skillId)?.category
      sections.push(`- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`)
    }
    sections.push(`## 职位要求技能列表`)
    for (const ds of params.jobSkills) {
      const cat = params.skillMetaMap.get(ds.skillId)?.category
      sections.push(`- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`)
    }

    // ── Section 3: Algorithm match details (10%) ──
    sections.push(`## 算法匹配结果 (基础分: ${params.algorithmScore.toFixed(1)}/100)`)
    const topMatches = params.matchDetails.filter(d => d.score > 0).slice(0, 15)
    if (topMatches.length > 0) {
      sections.push(`已匹配技能:`)
      for (const d of topMatches) {
        sections.push(`- ${d.skillName}: ${d.personProficiency} → ${d.jobRequirement}, 得分 ${d.score.toFixed(1)}`)
      }
    }

    // ── Section 4: Raw text excerpts (50%) ──
    const resumeText = this.extractKeyText(String(params.resumeDoc.parsedText || ''), 2000)
    const jobText = this.extractKeyText(String(params.jobDoc.parsedText || ''), 2000)

    if (resumeText) sections.push(`## 简历关键信息\n${resumeText}`)
    if (jobText) sections.push(`## 职位描述关键信息\n${jobText}`)

    // Add city info
    const resumeCity = params.person?.city || ''
    const jobCity = params.company?.city || ''
    if (resumeCity || jobCity) {
      sections.push(`## 地理信息\n- 候选人所在城市: ${resumeCity || '未知'}\n- 职位所在城市: ${jobCity || '未知'}`)
    }

    return sections.join('\n')
  }

  /** Extract key text, trimming to maxChars while preserving sentence boundaries */
  private extractKeyText(text: string, maxChars: number): string {
    if (!text || text.length === 0) return ''
    if (text.length <= maxChars) return text
    // Cut at sentence boundary
    const truncated = text.slice(0, maxChars)
    const lastPeriod = Math.max(truncated.lastIndexOf('。'), truncated.lastIndexOf('\n'))
    return lastPeriod > maxChars * 0.5 ? truncated.slice(0, lastPeriod + 1) : truncated + '...'
  }
}
