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

  async assessMatch(params: {
    resumeDoc: Document
    jobDoc: Document
    resumeSkills: DocumentSkill[]
    jobSkills: DocumentSkill[]
    skillMetaMap: Map<number, Skill>
    person?: User | null
    company?: User | null
    matchDetails: Array<{ skillName: string; personProficiency: string; jobRequirement: string }>
  }): Promise<{ assessment: LlmAssessment; communityContext: CommunityContext; step: AlgorithmStep }> {
    const t0 = Date.now()

    const communityContext = this.buildCommunityContext(params.resumeSkills, params.jobSkills, params.skillMetaMap)
    const context = this.buildMixedContext(params, communityContext)

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
      const fallback: LlmAssessment = { overallFit: 0, strengths: [], gaps: ['LLM评估不可用'], transferableSkills: [], readinessMonths: 0, confidence: 0, reasoning: `LLM评估失败: ${(err as Error).message}` }
      return { assessment: fallback, communityContext, step: { phase: 'llm_assessment', label: 'LLM 深度评估', status: 'error', durationMs: Date.now() - t0, summary: `评估失败: ${(err as Error).message}` } }
    }

    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(rawResponse.match(/\{[\s\S]*\}/)?.[0] || '{}') } catch { parsed = {} }

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

    return {
      assessment, communityContext,
      step: {
        phase: 'llm_assessment', label: 'LLM 深度评估', status: 'done', durationMs: Date.now() - t0,
        summary: `匹配度 ${assessment.overallFit}/100, 置信度 ${(assessment.confidence * 100).toFixed(0)}%, ${assessment.strengths.length} 项优势, ${assessment.gaps.length} 项差距`,
        data: { overallFit: assessment.overallFit, confidence: assessment.confidence, reasoning: assessment.reasoning },
      },
    }
  }

  private buildCommunityContext(
    resumeSkills: DocumentSkill[], jobSkills: DocumentSkill[], skillMetaMap: Map<number, Skill>,
  ): CommunityContext {
    const groupBy = (skills: DocumentSkill[]) => {
      const groups = new Map<number, { skills: string[]; categories: Set<string> }>()
      for (const ds of skills) {
        const cid = this.skillSimilarity.getCommunity(ds.skillId)
        if (cid === -1) continue
        if (!groups.has(cid)) groups.set(cid, { skills: [], categories: new Set() })
        const g = groups.get(cid)!
        g.skills.push(ds.skillName || ds.skill?.name || `skill-${ds.skillId}`)
        const cat = skillMetaMap.get(ds.skillId)?.category
        if (cat) g.categories.add(cat)
      }
      return [...groups.entries()].map(([id, g]) => ({
        title: `技能社区 #${id} (${g.categories.size > 0 ? [...g.categories][0] : '通用技能'})`,
        summary: `${g.skills.length} 个技能: ${g.skills.slice(0, 8).join(', ')}${g.skills.length > 8 ? '...' : ''}`,
        skillDomain: g.categories.size > 0 ? [...g.categories][0] : '通用技能',
      }))
    }
    const rc = groupBy(resumeSkills), jc = groupBy(jobSkills)
    return { resumeCommunities: rc, jobCommunities: jc, domainOverlap: [...new Set(rc.map(c => c.skillDomain))].filter(d => jc.some(c => c.skillDomain === d)) }
  }

  private buildMixedContext(
    params: {
      resumeDoc: Document; jobDoc: Document
      resumeSkills: DocumentSkill[]; jobSkills: DocumentSkill[]; skillMetaMap: Map<number, Skill>
      person?: User | null; company?: User | null
      matchDetails: Array<{ skillName: string; personProficiency: string; jobRequirement: string }>
    },
    cc: CommunityContext,
  ): string {
    const s: string[] = []

    // Community context
    if (cc.resumeCommunities.length > 0 || cc.jobCommunities.length > 0) {
      s.push('## 技能社区分析')
      if (cc.resumeCommunities.length > 0) { s.push('### 候选人技能社区'); cc.resumeCommunities.forEach(c => s.push(`- **${c.title}**: ${c.summary}`)) }
      if (cc.jobCommunities.length > 0) { s.push('### 职位技能社区'); cc.jobCommunities.forEach(c => s.push(`- **${c.title}**: ${c.summary}`)) }
      if (cc.domainOverlap.length > 0) s.push(`### 领域重叠: ${cc.domainOverlap.join(', ')}`)
    }

    // Skill tables
    s.push('## 候选人技能列表')
    for (const ds of params.resumeSkills) { const cat = params.skillMetaMap.get(ds.skillId)?.category; s.push(`- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`) }
    s.push('## 职位要求技能列表')
    for (const ds of params.jobSkills) { const cat = params.skillMetaMap.get(ds.skillId)?.category; s.push(`- ${ds.skillName || ds.skill?.name} [${ds.proficiency}]${cat ? ` (${cat})` : ''}`) }

    // Match details
    if (params.matchDetails.length > 0) {
      s.push('## 已识别的技能匹配')
      for (const d of params.matchDetails.slice(0, 15)) s.push(`- ${d.skillName}: ${d.personProficiency} → ${d.jobRequirement}`)
    }

    // Raw text excerpts
    const resumeText = this.extractKeyText(String(params.resumeDoc.parsedText || ''), 2000)
    const jobText = this.extractKeyText(String(params.jobDoc.parsedText || ''), 2000)
    if (resumeText) s.push(`## 简历关键信息\n${resumeText}`)
    if (jobText) s.push(`## 职位描述关键信息\n${jobText}`)

    // City
    const rc = params.person?.city || '', jc = params.company?.city || ''
    if (rc || jc) s.push(`## 地理信息\n- 候选人: ${rc || '未知'}\n- 职位: ${jc || '未知'}`)

    return s.join('\n')
  }

  private extractKeyText(text: string, max: number): string {
    if (!text || text.length <= max) return text
    const t = text.slice(0, max)
    const p = Math.max(t.lastIndexOf('。'), t.lastIndexOf('\n'))
    return p > max * 0.5 ? t.slice(0, p + 1) : t + '...'
  }
}
