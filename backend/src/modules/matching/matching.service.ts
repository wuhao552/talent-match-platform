import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { MatchResult, MatchDetail, ScoreBreakdown, AlgorithmStep, LlmAssessment, CommunityContext } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { SkillSimilarityService } from '../skill/skill-similarity.service'
import { User } from '../user/user.entity'
import { LlmMatchingService } from './llm-matching.service'

// ── Interfaces ──

export interface EnrichedMatch {
  id: string
  overallScore: number
  scoreBreakdown: ScoreBreakdown | null
  matchDetails: MatchDetail[]
  algorithmTrace?: AlgorithmStep[] | null
  llmAssessment?: LlmAssessment | null
  communityContext?: CommunityContext | null
  createdAt: Date
  resumeDocId: string
  resumeFilename: string
  candidateName: string
  candidateCity: string
  candidateTopSkills: string[]
  jobDocId: string
  jobFilename: string
  companyName: string
  jobTitle: string
  jobCity: string
  jobTopSkills: string[]
}

/** Pre-loaded data to avoid per-pair DB queries in recommend() */
interface MatchPreload {
  docMap: Map<string, Document>
  skillsByDoc: Map<string, DocumentSkill[]>
  userMap: Map<string, User>
  skillMetaMap: Map<number, Skill>
}

// ── Service ──

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
    private skillSimilarity: SkillSimilarityService,
    private llmMatching: LlmMatchingService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  //  GraphRAG Matching
  // ══════════════════════════════════════════════════════════════

  async calculateMatch(
    resumeDocId: string,
    jobDocId: string,
    preload?: MatchPreload,
  ): Promise<MatchResult> {
    try {
      return await this._graphRAGMatch(resumeDocId, jobDocId, preload)
    } catch (err) {
      console.error(
        `[GraphRAG] calculateMatch FAILED resume=${resumeDocId?.slice(0, 8)} job=${jobDocId?.slice(0, 8)}:`,
        (err as Error).message,
      )
      return this.matchRepo.save(
        this.matchRepo.create({
          resumeDocId, jobDocId, overallScore: 0,
          matchDetails: [], algorithmTrace: null, llmAssessment: null, communityContext: null,
          scoreBreakdown: { llmScore: 0, overallScore: 0, matchStatus: 'fallback' },
        }),
      )
    }
  }

  private async _graphRAGMatch(
    resumeDocId: string,
    jobDocId: string,
    preload?: MatchPreload,
  ): Promise<MatchResult> {
    const trace: AlgorithmStep[] = []

    // ━━━ Step 1: Load data ━━━
    const t0 = Date.now()
    let resumeSkills: DocumentSkill[]
    let jobSkills: DocumentSkill[]
    let resumeDoc: Document | null
    let jobDoc: Document | null
    let skillMetaMap: Map<number, Skill>
    let person: User | null = null
    let company: User | null = null

    if (preload) {
      resumeSkills = preload.skillsByDoc.get(resumeDocId) || []
      jobSkills = preload.skillsByDoc.get(jobDocId) || []
      resumeDoc = preload.docMap.get(resumeDocId) || null
      jobDoc = preload.docMap.get(jobDocId) || null
      skillMetaMap = preload.skillMetaMap
      if (resumeDoc) person = preload.userMap.get(resumeDoc.userId) || null
      if (jobDoc) company = preload.userMap.get(jobDoc.userId) || null
    } else {
      ;[resumeSkills, jobSkills, resumeDoc, jobDoc] = await Promise.all([
        this.dsRepo.find({ where: { documentId: resumeDocId }, relations: ['skill'] }),
        this.dsRepo.find({ where: { documentId: jobDocId }, relations: ['skill'] }),
        this.docRepo.findOne({ where: { id: resumeDocId } }),
        this.docRepo.findOne({ where: { id: jobDocId } }),
      ])
      const allSkillIds = new Set<number>()
      for (const ds of resumeSkills) allSkillIds.add(ds.skillId)
      for (const ds of jobSkills) allSkillIds.add(ds.skillId)
      skillMetaMap = new Map<number, Skill>()
      if (allSkillIds.size > 0) {
        const skillEntities = await this.skillRepo.findBy([...allSkillIds].map(id => ({ id })))
        for (const s of skillEntities) skillMetaMap.set(s.id, s)
      }
      if (resumeDoc) person = await this.userRepo.findOne({ where: { id: resumeDoc.userId } })
      if (jobDoc) company = await this.userRepo.findOne({ where: { id: jobDoc.userId } })
    }

    if (!resumeDoc || !jobDoc) throw new Error('Document not found')

    trace.push({ phase: 'data_loading', label: '数据加载', status: 'done', durationMs: Date.now() - t0, summary: `简历 ${resumeSkills.length} 项技能, 职位 ${jobSkills.length} 项技能` })

    // ━━━ Step 2: Identify matching skills ━━━
    const t1 = Date.now()
    const matchDetails: MatchDetail[] = []

    const resumeById = new Map<number, DocumentSkill>()
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds)
    const jobById = new Map<number, DocumentSkill>()
    for (const ds of jobSkills) jobById.set(ds.skillId, ds)

    const usedResumeSkillIds = new Set<number>()
    const usedJobSkillIds = new Set<number>()

    // 2a: ID-based
    for (const [skillId, jobSkill] of jobById) {
      if (resumeById.has(skillId)) {
        matchDetails.push({
          skillId,
          skillName: jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeById.get(skillId)!.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        })
        usedResumeSkillIds.add(skillId)
        usedJobSkillIds.add(skillId)
      }
    }

    // 2b: Fuzzy match
    const resumeRemaining = resumeSkills.filter(s => !usedResumeSkillIds.has(s.skillId))
    const jobRemaining = jobSkills.filter(s => !usedJobSkillIds.has(s.skillId))
    const usedFuzzyResume = new Set<number>()

    for (const jobSkill of jobRemaining) {
      let best: { rs: DocumentSkill; sim: number } | null = null
      for (const rs of resumeRemaining) {
        if (usedFuzzyResume.has(rs.skillId)) continue
        let sim = this.skillSimilarity.getSimilarity(jobSkill.skillId, rs.skillId)
        if (sim === 0 && this.skillSimilarity.sameCommunity(jobSkill.skillId, rs.skillId)) sim = 0.3
        if (sim === 0) sim = this.nameSimilarity(jobSkill.skillName || '', rs.skillName || '')
        if (sim >= 0.4 && (!best || sim > best.sim)) best = { rs, sim }
      }
      if (best) {
        usedFuzzyResume.add(best.rs.skillId)
        matchDetails.push({
          skillId: -Math.round(best.sim * 100),
          skillName: `${best.rs.skillName || best.rs.skill?.name} ↔ ${jobSkill.skillName || jobSkill.skill?.name}`,
          personProficiency: best.rs.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          resumeSkillId: best.rs.skillId,
          jobSkillId: jobSkill.skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        })
        usedResumeSkillIds.add(best.rs.skillId)
        usedJobSkillIds.add(jobSkill.skillId)
      }
    }

    trace.push({
      phase: 'skill_matching', label: '技能匹配识别', status: 'done', durationMs: Date.now() - t1,
      summary: `${matchDetails.length} 项技能匹配 (ID: ${matchDetails.filter(d => d.skillId > 0).length}, 模糊: ${matchDetails.filter(d => d.skillId < 0).length})`,
      data: { unmatchedJobSkills: jobRemaining.filter(s => !usedJobSkillIds.has(s.skillId)).map(s => s.skillName || s.skill?.name) },
    })

    // ━━━ Step 3: LLM Deep Assessment ━━━
    let llmAssessment: LlmAssessment | null = null
    let communityContext: CommunityContext | null = null

    try {
      const llmResult = await this.llmMatching.assessMatch({
        resumeDoc, jobDoc,
        resumeSkills, jobSkills, skillMetaMap,
        person, company,
        matchDetails: matchDetails.map(d => ({ skillName: d.skillName, personProficiency: d.personProficiency, jobRequirement: d.jobRequirement })),
      })
      llmAssessment = llmResult.assessment
      communityContext = llmResult.communityContext
      trace.push(llmResult.step)
    } catch (err) {
      console.error(`[GraphRAG] LLM assessment failed:`, (err as Error).message)
      trace.push({ phase: 'llm_assessment', label: 'LLM 深度评估', status: 'error', durationMs: 0, summary: `评估失败: ${(err as Error).message}` })
    }

    // ━━━ Step 4: Compose result ━━━
    const overallScore = llmAssessment?.overallFit ?? 0
    const scoreBreakdown: ScoreBreakdown = {
      llmScore: llmAssessment?.overallFit ?? 0,
      overallScore,
      matchStatus: llmAssessment ? 'computed' : 'fallback',
    }

    trace.push({ phase: 'result', label: '最终结果', status: 'done', durationMs: 0, summary: `GraphRAG 匹配分: ${overallScore.toFixed(1)}/100` })

    console.log(`[GraphRAG] resume=${resumeDocId.slice(0, 8)} job=${jobDocId.slice(0, 8)} | skills=${matchDetails.length} | score=${overallScore.toFixed(1)} | confidence=${llmAssessment?.confidence?.toFixed(2) || 'N/A'}`)

    const entityData = { overallScore, matchDetails, scoreBreakdown, algorithmTrace: trace, llmAssessment, communityContext }

    let match = await this.matchRepo.findOne({ where: { resumeDocId, jobDocId }, order: { createdAt: 'DESC' } })
    if (match) {
      Object.assign(match, entityData, { staleAt: null })
      return this.matchRepo.save(match)
    }
    return this.matchRepo.save(this.matchRepo.create({ resumeDocId, jobDocId, ...entityData }))
  }

  // ══════════════════════════════════════════════════════════════
  //  Recommend (single method for both roles)
  // ══════════════════════════════════════════════════════════════

  async recommend(userId: string, userRole: string): Promise<EnrichedMatch[]> {
    const isIndividual = userRole === 'individual'

    const myDocs = await this.docRepo.find({
      where: { userId, docType: isIndividual ? 'resume' : 'job_description', status: 'parsed' },
    })
    if (myDocs.length === 0) return []

    const otherDocs = await this.docRepo.find({
      where: { docType: isIndividual ? 'job_description' : 'resume', status: 'parsed' },
    })
    if (otherDocs.length === 0) return []

    const myIds = myDocs.map(d => d.id)
    const otherIds = otherDocs.map(d => d.id)

    // Cached matches
    const existingMatches = await this.matchRepo.createQueryBuilder('mr')
      .where('mr.resumeDocId IN (:...resumeIds) AND mr.jobDocId IN (:...jobIds)', {
        resumeIds: isIndividual ? myIds : otherIds,
        jobIds: isIndividual ? otherIds : myIds,
      })
      .andWhere('mr.staleAt IS NULL')
      .orderBy('mr.createdAt', 'DESC').getMany()

    const matchCache = new Map<string, MatchResult>()
    for (const m of existingMatches) {
      const key = `${m.resumeDocId}-${m.jobDocId}`
      if (!matchCache.has(key)) matchCache.set(key, m)
    }

    // Preload all data
    const allDocIds = [...new Set([...myIds, ...otherIds])]
    const preload = await this.buildPreload(allDocIds, [...myDocs, ...otherDocs])

    // Separate cached from missing
    const results: MatchResult[] = []
    const missing: Array<{ resumeId: string; jobId: string }> = []

    for (const my of myDocs) {
      for (const other of otherDocs) {
        const resumeId = isIndividual ? my.id : other.id
        const jobId = isIndividual ? other.id : my.id
        const key = `${resumeId}-${jobId}`
        const cached = matchCache.get(key)
        if (cached) {
          results.push(cached)
        } else {
          missing.push({ resumeId, jobId })
        }
      }
    }

    // Vector pre-filter: keep only Top-K per "my" doc
    const TOP_K = 20
    if (this.skillSimilarity.isLoaded && missing.length > TOP_K) {
      const getIds = (docId: string) => (preload.skillsByDoc.get(docId) || []).map(s => s.skillId)
      const myVecs = myDocs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getIds(d.id)) }))
      const otherVecs = otherDocs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getIds(d.id)) }))

      const filtered: typeof missing = []
      for (const mv of myVecs) {
        const sims = this.skillSimilarity.batchCosineSim(mv.vec, otherVecs.map(o => o.vec))
        const ranked = sims.map((sim, i) => ({ i, sim })).sort((a, b) => b.sim - a.sim).slice(0, TOP_K)
        for (const { i } of ranked) {
          const resumeId = isIndividual ? mv.id : otherVecs[i].id
          const jobId = isIndividual ? otherVecs[i].id : mv.id
          const pair = missing.find(p => p.resumeId === resumeId && p.jobId === jobId)
          if (pair) filtered.push(pair)
        }
      }
      missing.length = 0
      missing.push(...filtered)
    }

    // Compute missing matches in parallel
    if (missing.length > 0) {
      const pLimit = (await import('p-limit')).default
      const limit = pLimit(3)
      const computed = await Promise.allSettled(
        missing.map(p => limit(() => this.calculateMatch(p.resumeId, p.jobId, preload))),
      )
      for (const r of computed) { if (r.status === 'fulfilled') results.push(r.value) }
    }

    return this.enrichResults(results.sort((a, b) => b.overallScore - a.overallScore))
  }

  // ══════════════════════════════════════════════════════════════
  //  CRUD / Query
  // ══════════════════════════════════════════════════════════════

  private async buildPreload(allDocIds: string[], docs: Document[]): Promise<MatchPreload> {
    const [allSkills, allUsers] = await Promise.all([
      this.dsRepo.find({ where: { documentId: In(allDocIds) }, relations: ['skill'] }),
      this.userRepo.find({ where: { id: In([...new Set(docs.map(d => d.userId).filter(Boolean))]) } }),
    ])
    const skillsByDoc = new Map<string, DocumentSkill[]>()
    for (const s of allSkills) {
      const arr = skillsByDoc.get(s.documentId) || []
      arr.push(s)
      skillsByDoc.set(s.documentId, arr)
    }
    const allSkillIds = new Set(allSkills.map(s => s.skillId))
    const skillMetaMap = new Map<number, Skill>()
    if (allSkillIds.size > 0) {
      const entities = await this.skillRepo.findBy([...allSkillIds].map(id => ({ id })))
      for (const s of entities) skillMetaMap.set(s.id, s)
    }
    return {
      docMap: new Map(docs.map(d => [d.id, d])),
      skillsByDoc,
      userMap: new Map(allUsers.map(u => [u.id, u])),
      skillMetaMap,
    }
  }

  async getResults(userId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo.createQueryBuilder('mr')
      .leftJoinAndSelect('mr.resumeDoc', 'resume')
      .leftJoinAndSelect('mr.jobDoc', 'job')
      .where('resume.userId = :userId', { userId })
      .orWhere('job.userId = :userId', { userId })
      .orderBy('mr.createdAt', 'DESC').getMany()
    const seen = new Set<string>()
    return this.enrichResults(results.filter(r => { const k = `${r.resumeDocId}-${r.jobDocId}`; if (seen.has(k)) return false; seen.add(k); return true }))
  }

  async getResult(id: string): Promise<EnrichedMatch> {
    const [enriched] = await this.enrichResults([await this.matchRepo.findOneOrFail({ where: { id } })])
    return enriched
  }

  async getMatchesByJob(jobDocId: string): Promise<EnrichedMatch[]> {
    return this.enrichResults((await this.matchRepo.find({ where: { jobDocId } })).sort((a, b) => b.overallScore - a.overallScore))
  }

  async getMatchesByResume(resumeDocId: string): Promise<EnrichedMatch[]> {
    return this.enrichResults((await this.matchRepo.find({ where: { resumeDocId } })).sort((a, b) => b.overallScore - a.overallScore))
  }

  async invalidateByDocument(documentId: string): Promise<void> {
    await this.matchRepo.createQueryBuilder().update().set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: documentId }).execute()
  }

  // ══════════════════════════════════════════════════════════════
  //  Enrichment
  // ══════════════════════════════════════════════════════════════

  private async enrichResults(results: MatchResult[]): Promise<EnrichedMatch[]> {
    if (results.length === 0) return []
    const allDocIds = [...new Set(results.flatMap(r => [r.resumeDocId, r.jobDocId]))]
    const [docs, allSkills] = await Promise.all([
      this.docRepo.findByIds(allDocIds),
      this.dsRepo.find({ where: { documentId: In(allDocIds) }, relations: ['skill'] }),
    ])
    const docMap = new Map(docs.map(d => [d.id, d]))
    const userIds = [...new Set(docs.map(d => d.userId).filter(Boolean))]
    const users = userIds.length > 0 ? await this.userRepo.findByIds(userIds) : []
    const userMap = new Map(users.map(u => [u.id, u]))
    const skillsByDoc = new Map<string, DocumentSkill[]>()
    for (const s of allSkills) { const a = skillsByDoc.get(s.documentId) || []; a.push(s); skillsByDoc.set(s.documentId, a) }

    return results.flatMap(r => {
      const resumeDoc = docMap.get(r.resumeDocId)
      const jobDoc = docMap.get(r.jobDocId)
      if (!resumeDoc || !jobDoc) return []
      const candidate = userMap.get(resumeDoc.userId)
      const company = userMap.get(jobDoc.userId)
      const jobParsed = (jobDoc.parsedJson as any)?.structured || {}
      const resumeParsed = (resumeDoc.parsedJson as any)?.structured || {}
      return [{
        id: r.id, overallScore: r.overallScore, scoreBreakdown: r.scoreBreakdown || null,
        matchDetails: r.matchDetails, algorithmTrace: r.algorithmTrace, llmAssessment: r.llmAssessment,
        communityContext: r.communityContext, createdAt: r.createdAt,
        resumeDocId: r.resumeDocId, resumeFilename: resumeDoc.originalFilename,
        candidateName: resumeParsed?.name || candidate?.username || '未知',
        candidateCity: candidate?.city || resumeParsed?.city || '',
        candidateTopSkills: (skillsByDoc.get(r.resumeDocId) || []).slice(0, 6).map(s => s.skillName || s.skill?.name || '').filter(Boolean),
        jobDocId: r.jobDocId, jobFilename: jobDoc.originalFilename,
        companyName: company?.companyName || jobParsed?.companyName || jobParsed?.company || '',
        jobTitle: jobParsed?.jobTitle || jobParsed?.title || jobDoc.originalFilename,
        jobCity: company?.city || jobParsed?.location || jobParsed?.city || '',
        jobTopSkills: (skillsByDoc.get(r.jobDocId) || []).slice(0, 6).map(s => s.skillName || s.skill?.name || '').filter(Boolean),
      }]
    })
  }

  // ══════════════════════════════════════════════════════════════
  //  Utilities
  // ══════════════════════════════════════════════════════════════

  private inferImportance(proficiency: string): string {
    const idx = ['beginner', 'intermediate', 'advanced', 'expert'].indexOf(proficiency)
    return idx >= 2 ? 'required' : idx >= 1 ? 'preferred' : 'optional'
  }

  private nameSimilarity(a: string, b: string): number {
    const al = this.normalizeSkillName(a), bl = this.normalizeSkillName(b)
    if (!al || !bl) return 0
    if (al === bl) return 1.0
    if (al.includes(bl) || bl.includes(al)) return 0.75 + Math.min(al.length, bl.length) / Math.max(al.length, bl.length) * 0.25
    const maxLen = Math.max(al.length, bl.length)
    const sim = 1 - this.levenshtein(al, bl) / maxLen
    return maxLen < 5 ? (sim >= 0.8 ? sim : 0) : (sim >= 0.6 ? sim : 0)
  }

  private normalizeSkillName(name: string): string {
    let s = name.toLowerCase().replace(/\.(js|ts|jsx|tsx|py|java|go|rb|cs|swift|kt|rs|cpp|c)$/i, '').replace(/[^a-z0-9一-鿿+#.]/g, '')
    for (const suffix of ['系统开发','开发','设计','框架','技术','平台','工具','应用','编程','语言','算法','模型','架构','服务','组件','引擎','系统','方案','流程','管理','分析','测试','部署','优化','配置','实现','封装']) {
      if (s.endsWith(suffix) && s.length > suffix.length + 1) { s = s.slice(0, -suffix.length); break }
    }
    return s
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    let prev = Array.from({ length: n + 1 }, (_, j) => j), curr = new Array(n + 1)
    for (let i = 1; i <= m; i++) { curr[0] = i; for (let j = 1; j <= n; j++) curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, curr] = [curr, prev] }
    return prev[n]
  }
}
