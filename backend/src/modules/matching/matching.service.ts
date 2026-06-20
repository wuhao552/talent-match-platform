import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { MatchResult, MatchDetail, ScoreBreakdown, AlgorithmStep, LlmAssessment, CommunityContext } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { Neo4jService } from '../graph/neo4j.service'
import { SkillSimilarityService } from '../skill/skill-similarity.service'
import { User } from '../user/user.entity'
import { LlmMatchingService } from './llm-matching.service'

// ── Interfaces ──

export interface EnrichedMatch {
  id: string
  overallScore: number
  skillMatchScore: number
  cityMatchBonus: number
  cooccurrenceBonus: number
  hotnessBonus: number
  experienceBonus: number
  industryMatchBonus: number
  trendBonus: number
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
    private neo4j: Neo4jService,
    private skillSimilarity: SkillSimilarityService,
    private llmMatching: LlmMatchingService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  //  GraphRAG Matching — LLM-first workflow
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
          resumeDocId, jobDocId, overallScore: 0, skillMatchScore: 0,
          cityMatchBonus: 0, cooccurrenceBonus: 0, hotnessBonus: 0,
          experienceBonus: 0, industryMatchBonus: 0, trendBonus: 0,
          matchDetails: [], algorithmTrace: null, llmAssessment: null, communityContext: null,
          scoreBreakdown: { skillMatchScore: 0, cooccurrenceBonus: 0, cityMatchBonus: 0, hotnessBonus: 0, experienceBonus: 0, industryMatchBonus: 0, trendBonus: 0, algorithmScore: 0, overallScore: 0, matchStatus: 'fallback' },
        }),
      )
    }
  }

  /**
   * GraphRAG-style matching:
   *   Step 1 — Data loading
   *   Step 2 — Skill identification (ID match + fuzzy match + co-occurrence)
   *   Step 3 — LLM deep assessment (community-aware, with raw text)
   *   Step 4 — Result composition
   */
  private async _graphRAGMatch(
    resumeDocId: string,
    jobDocId: string,
    preload?: MatchPreload,
  ): Promise<MatchResult> {
    const trace: AlgorithmStep[] = []

    // ━━━ Step 1: Load all data ━━━
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
        const skillEntities = await this.skillRepo.findBy([...allSkillIds].map((id) => ({ id })))
        for (const s of skillEntities) skillMetaMap.set(s.id, s)
      }
      if (resumeDoc) { const u = await this.userRepo.findOne({ where: { id: resumeDoc.userId } }); person = u }
      if (jobDoc) { const u = await this.userRepo.findOne({ where: { id: jobDoc.userId } }); company = u }
    }

    if (!resumeDoc || !jobDoc) throw new Error('Document not found')

    trace.push({
      phase: 'data_loading', label: '数据加载',
      status: 'done', durationMs: Date.now() - t0,
      summary: `简历 ${resumeSkills.length} 项技能, 职位 ${jobSkills.length} 项技能`,
    })

    // ━━━ Step 2: Identify matching skills (ID + fuzzy + co-occurrence) ━━━
    const t1 = Date.now()
    const matchDetails: MatchDetail[] = []

    const resumeById = new Map<number, DocumentSkill>()
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds)
    const jobById = new Map<number, DocumentSkill>()
    for (const ds of jobSkills) jobById.set(ds.skillId, ds)

    const usedResumeSkillIds = new Set<number>()
    const usedJobSkillIds = new Set<number>()

    // 2a: ID-based matching
    for (const [skillId, jobSkill] of jobById) {
      const resumeSkill = resumeById.get(skillId)
      if (resumeSkill) {
        matchDetails.push({
          skillId,
          skillName: jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeSkill.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          score: 100,
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        })
        usedResumeSkillIds.add(skillId)
        usedJobSkillIds.add(skillId)
      }
    }

    // 2b: Name-based fuzzy matching for remaining skills
    const resumeRemaining = resumeSkills.filter(s => !usedResumeSkillIds.has(s.skillId))
    const jobRemaining = jobSkills.filter(s => !usedJobSkillIds.has(s.skillId))
    const usedFuzzyResume = new Set<number>()

    for (const jobSkill of jobRemaining) {
      let bestMatch: { resumeSkill: DocumentSkill; sim: number } | null = null
      for (const resumeSkill of resumeRemaining) {
        if (usedFuzzyResume.has(resumeSkill.skillId)) continue
        let sim = 0
        // Graph similarity O(1) lookup
        sim = this.skillSimilarity.getSimilarity(jobSkill.skillId, resumeSkill.skillId)
        // Same community → base similarity
        if (sim === 0 && this.skillSimilarity.sameCommunity(jobSkill.skillId, resumeSkill.skillId)) {
          sim = 0.3
        }
        // Fallback to string similarity
        if (sim === 0) {
          sim = this.nameSimilarity(
            jobSkill.skillName || jobSkill.skill?.name || '',
            resumeSkill.skillName || resumeSkill.skill?.name || '',
          )
        }
        if (sim >= 0.4 && (!bestMatch || sim > bestMatch.sim)) {
          bestMatch = { resumeSkill, sim }
        }
      }
      if (bestMatch) {
        usedFuzzyResume.add(bestMatch.resumeSkill.skillId)
        matchDetails.push({
          skillId: -Math.round(bestMatch.sim * 100),
          skillName: `${bestMatch.resumeSkill.skillName || bestMatch.resumeSkill.skill?.name} ↔ ${jobSkill.skillName || jobSkill.skill?.name}`,
          personProficiency: bestMatch.resumeSkill.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          score: Math.round(bestMatch.sim * 100),
          resumeSkillId: bestMatch.resumeSkill.skillId,
          jobSkillId: jobSkill.skillId,
          importance: this.inferImportance(jobSkill.proficiency),
        })
        usedResumeSkillIds.add(bestMatch.resumeSkill.skillId)
        usedJobSkillIds.add(jobSkill.skillId)
      }
    }

    // 2c: Co-occurrence edges (context for LLM, not scoring)
    const extraResumeIds = [...resumeById.keys()].filter(id => !jobById.has(id))
    const allJobIds = [...jobById.keys()]
    let coocEdges: Array<{ sourceId: number; targetId: number; freqSkill: number }> = []
    if (extraResumeIds.length > 0 && allJobIds.length > 0) {
      try {
        coocEdges = await this.neo4j.batchGetCooccurrences(extraResumeIds, allJobIds)
      } catch { /* non-critical */ }
    }

    trace.push({
      phase: 'skill_matching', label: '技能匹配识别',
      status: 'done', durationMs: Date.now() - t1,
      summary: `${matchDetails.length} 项直接匹配, ${coocEdges.length} 条共现关系, ID匹配 ${[...usedJobSkillIds].filter(id => jobById.has(id) && resumeById.has(id)).length} 项`,
      data: {
        directMatchCount: matchDetails.filter(d => d.skillId > 0).length,
        fuzzyMatchCount: matchDetails.filter(d => d.skillId < 0).length,
        coocEdgeCount: coocEdges.length,
        unmatchedJobSkills: jobRemaining.filter(s => !usedJobSkillIds.has(s.skillId)).map(s => s.skillName || s.skill?.name),
      },
    })

    // ━━━ Step 3: LLM Deep Assessment (GraphRAG core) ━━━
    let llmAssessment: LlmAssessment | null = null
    let communityContext: CommunityContext | null = null

    try {
      const llmResult = await this.llmMatching.assessMatch({
        resumeDoc, jobDoc,
        resumeSkills, jobSkills, skillMetaMap,
        person, company,
        algorithmScore: 0, // Not used in GraphRAG mode — LLM is primary
        matchDetails: matchDetails.map(d => ({
          skillName: d.skillName, score: d.score,
          personProficiency: d.personProficiency, jobRequirement: d.jobRequirement,
        })),
      })
      llmAssessment = llmResult.assessment
      communityContext = llmResult.communityContext
      trace.push(llmResult.step)
    } catch (err) {
      console.error(`[GraphRAG] LLM assessment failed:`, (err as Error).message)
      trace.push({
        phase: 'llm_assessment', label: 'LLM 深度评估',
        status: 'error', durationMs: 0,
        summary: `评估失败: ${(err as Error).message}`,
      })
    }

    // ━━━ Step 4: Compose final result ━━━
    const overallScore = llmAssessment?.overallFit ?? 0

    const scoreBreakdown: ScoreBreakdown = {
      skillMatchScore: 0, // No longer computed mechanically
      cooccurrenceBonus: 0,
      cityMatchBonus: 0,
      hotnessBonus: 0,
      experienceBonus: 0,
      industryMatchBonus: 0,
      trendBonus: 0,
      algorithmScore: 0,
      llmScore: llmAssessment?.overallFit,
      overallScore,
      fusionWeights: { algorithm: 0, llm: 1.0 },
      matchStatus: llmAssessment ? 'computed' : 'fallback',
    }

    trace.push({
      phase: 'result', label: '最终结果',
      status: 'done', durationMs: 0,
      summary: `GraphRAG 匹配分: ${overallScore.toFixed(1)}/100, ${matchDetails.length} 项技能匹配`,
    })

    console.log(
      `[GraphRAG] resume=${resumeDocId.slice(0, 8)} job=${jobDocId.slice(0, 8)} | ` +
      `skills=${matchDetails.length} | score=${overallScore.toFixed(1)} | ` +
      `llm=${llmAssessment?.overallFit?.toFixed(1) || 'N/A'} | ` +
      `confidence=${llmAssessment?.confidence?.toFixed(2) || 'N/A'}`,
    )

    // Upsert
    let match = await this.matchRepo.findOne({
      where: { resumeDocId, jobDocId },
      order: { createdAt: 'DESC' },
    })
    const entityData = {
      overallScore,
      skillMatchScore: 0,
      cityMatchBonus: 0, cooccurrenceBonus: 0, hotnessBonus: 0,
      experienceBonus: 0, industryMatchBonus: 0, trendBonus: 0,
      matchDetails, scoreBreakdown,
      algorithmTrace: trace,
      llmAssessment,
      communityContext,
    }
    if (match) {
      Object.assign(match, entityData, { staleAt: null })
      return this.matchRepo.save(match)
    }
    return this.matchRepo.save(this.matchRepo.create({ resumeDocId, jobDocId, ...entityData }))
  }

  // ══════════════════════════════════════════════════════════════
  //  Recommend
  // ══════════════════════════════════════════════════════════════

  async recommend(userId: string, userRole: string): Promise<EnrichedMatch[]> {
    const results: MatchResult[] = []
    const seen = new Set<string>()

    if (userRole === 'individual') {
      const myDocs = await this.docRepo.find({ where: { userId, docType: 'resume', status: 'parsed' } })
      if (myDocs.length === 0) return []
      const jobDocs = await this.docRepo.find({ where: { docType: 'job_description', status: 'parsed' } })
      const resumeIds = myDocs.map(d => d.id)
      const jobIds = jobDocs.map(d => d.id)

      const existingMatches = resumeIds.length > 0 && jobIds.length > 0
        ? await this.matchRepo.createQueryBuilder('mr')
            .where('mr.resumeDocId IN (:...resumeIds) AND mr.jobDocId IN (:...jobIds)', { resumeIds, jobIds })
            .andWhere('mr.staleAt IS NULL')
            .orderBy('mr.createdAt', 'DESC').getMany()
        : []
      const matchCache = new Map<string, MatchResult>()
      for (const m of existingMatches) {
        const key = `${m.resumeDocId}-${m.jobDocId}`
        if (!matchCache.has(key)) matchCache.set(key, m)
      }

      const allDocIds = [...new Set([...resumeIds, ...jobIds])]
      const preload = await this.buildPreload(allDocIds, [...myDocs, ...jobDocs])

      // Vector pre-filter: top-K per resume
      const TOP_K = 20
      const getDocSkillIds = (docId: string): number[] =>
        (preload.skillsByDoc.get(docId) || []).map(s => s.skillId)
      const resumeVecs = myDocs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getDocSkillIds(d.id)) }))
      const jobVecs = jobDocs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getDocSkillIds(d.id)) }))

      const missing: Array<{ resumeId: string; jobId: string }> = []

      // Cached hits first
      for (const myDoc of myDocs) {
        for (const jobDoc of jobDocs) {
          const key = `${myDoc.id}-${jobDoc.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const cached = matchCache.get(key)
          if (cached) results.push(cached)
        }
      }

      // Vector pre-filter for uncached
      if (this.skillSimilarity.isLoaded) {
        for (const rv of resumeVecs) {
          const sims = this.skillSimilarity.batchCosineSim(rv.vec, jobVecs.map(j => j.vec))
          const ranked = sims.map((sim, i) => ({ i, sim })).sort((a, b) => b.sim - a.sim).slice(0, TOP_K)
          for (const { i } of ranked) {
            const key = `${rv.id}-${jobVecs[i].id}`
            if (!matchCache.has(key)) missing.push({ resumeId: rv.id, jobId: jobVecs[i].id })
          }
        }
      } else {
        for (const myDoc of myDocs) {
          for (const jobDoc of jobDocs) {
            const key = `${myDoc.id}-${jobDoc.id}`
            if (!matchCache.has(key)) missing.push({ resumeId: myDoc.id, jobId: jobDoc.id })
          }
        }
      }

      if (missing.length > 0) {
        const pLimit = (await import('p-limit')).default
        const limit = pLimit(3) // Lower concurrency for LLM calls
        const computed = await Promise.allSettled(
          missing.map(p => limit(() => this.calculateMatch(p.resumeId, p.jobId, preload))),
        )
        for (const r of computed) { if (r.status === 'fulfilled') results.push(r.value) }
      }
    } else {
      // Enterprise: match their jobs against all resumes
      const myJobs = await this.docRepo.find({ where: { userId, docType: 'job_description', status: 'parsed' } })
      if (myJobs.length === 0) return []
      const resumeDocs = await this.docRepo.find({ where: { docType: 'resume', status: 'parsed' } })
      const resumeIds = resumeDocs.map(d => d.id)
      const jobIds = myJobs.map(d => d.id)

      const existingMatches = resumeIds.length > 0 && jobIds.length > 0
        ? await this.matchRepo.createQueryBuilder('mr')
            .where('mr.resumeDocId IN (:...resumeIds) AND mr.jobDocId IN (:...jobIds)', { resumeIds, jobIds })
            .andWhere('mr.staleAt IS NULL')
            .orderBy('mr.createdAt', 'DESC').getMany()
        : []
      const matchCache = new Map<string, MatchResult>()
      for (const m of existingMatches) {
        const key = `${m.resumeDocId}-${m.jobDocId}`
        if (!matchCache.has(key)) matchCache.set(key, m)
      }

      const allDocIds = [...new Set([...resumeIds, ...jobIds])]
      const preload = await this.buildPreload(allDocIds, [...resumeDocs, ...myJobs])

      const TOP_K = 20
      const getDocSkillIds = (docId: string): number[] =>
        (preload.skillsByDoc.get(docId) || []).map(s => s.skillId)
      const resumeVecs = resumeDocs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getDocSkillIds(d.id)) }))
      const jobVecs = myJobs.map(d => ({ id: d.id, vec: this.skillSimilarity.docVector(getDocSkillIds(d.id)) }))

      const missing: Array<{ resumeId: string; jobId: string }> = []

      for (const myJob of myJobs) {
        for (const resumeDoc of resumeDocs) {
          const key = `${resumeDoc.id}-${myJob.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const cached = matchCache.get(key)
          if (cached) results.push(cached)
        }
      }

      if (this.skillSimilarity.isLoaded) {
        for (const jv of jobVecs) {
          const sims = this.skillSimilarity.batchCosineSim(jv.vec, resumeVecs.map(r => r.vec))
          const ranked = sims.map((sim, i) => ({ i, sim })).sort((a, b) => b.sim - a.sim).slice(0, TOP_K)
          for (const { i } of ranked) {
            const key = `${resumeVecs[i].id}-${jv.id}`
            if (!matchCache.has(key)) missing.push({ resumeId: resumeVecs[i].id, jobId: jv.id })
          }
        }
      } else {
        for (const myJob of myJobs) {
          for (const resumeDoc of resumeDocs) {
            const key = `${resumeDoc.id}-${myJob.id}`
            if (!matchCache.has(key)) missing.push({ resumeId: resumeDoc.id, jobId: myJob.id })
          }
        }
      }

      if (missing.length > 0) {
        const pLimit = (await import('p-limit')).default
        const limit = pLimit(3)
        const computed = await Promise.allSettled(
          missing.map(p => limit(() => this.calculateMatch(p.resumeId, p.jobId, preload))),
        )
        for (const r of computed) { if (r.status === 'fulfilled') results.push(r.value) }
      }
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
    const docMap = new Map(docs.map(d => [d.id, d]))
    const userMap = new Map(allUsers.map(u => [u.id, u]))
    const allSkillIds = new Set<number>()
    for (const s of allSkills) allSkillIds.add(s.skillId)
    const skillMetaMap = new Map<number, Skill>()
    if (allSkillIds.size > 0) {
      const skillEntities = await this.skillRepo.findBy([...allSkillIds].map(id => ({ id })))
      for (const s of skillEntities) skillMetaMap.set(s.id, s)
    }
    return { docMap, skillsByDoc, userMap, skillMetaMap }
  }

  async getResults(userId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo.createQueryBuilder('mr')
      .leftJoinAndSelect('mr.resumeDoc', 'resume')
      .leftJoinAndSelect('mr.jobDoc', 'job')
      .where('resume.userId = :userId', { userId })
      .orWhere('job.userId = :userId', { userId })
      .orderBy('mr.createdAt', 'DESC').getMany()
    const seen = new Set<string>()
    const deduped = results.filter(r => {
      const key = `${r.resumeDocId}-${r.jobDocId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return this.enrichResults(deduped)
  }

  async getResult(id: string): Promise<EnrichedMatch> {
    const result = await this.matchRepo.findOneOrFail({ where: { id } })
    const [enriched] = await this.enrichResults([result])
    return enriched
  }

  async getMatchesByJob(jobDocId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo.find({ where: { jobDocId } })
    return this.enrichResults(results.sort((a, b) => b.overallScore - a.overallScore))
  }

  async getMatchesByResume(resumeDocId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo.find({ where: { resumeDocId } })
    return this.enrichResults(results.sort((a, b) => b.overallScore - a.overallScore))
  }

  async invalidateByDocument(documentId: string): Promise<void> {
    await this.matchRepo.createQueryBuilder()
      .update().set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: documentId }).execute()
  }

  // ══════════════════════════════════════════════════════════════
  //  Enrichment
  // ══════════════════════════════════════════════════════════════

  private async enrichResults(results: MatchResult[]): Promise<EnrichedMatch[]> {
    if (results.length === 0) return []
    const resumeDocIds = [...new Set(results.map(r => r.resumeDocId))]
    const jobDocIds = [...new Set(results.map(r => r.jobDocId))]
    const allDocIds = [...new Set([...resumeDocIds, ...jobDocIds])]

    const [docs, allSkills] = await Promise.all([
      this.docRepo.findByIds(allDocIds),
      this.dsRepo.find({ where: { documentId: In(allDocIds) }, relations: ['skill'] }),
    ])
    const docMap = new Map(docs.map(d => [d.id, d]))
    const userIds = [...new Set(docs.map(d => d.userId).filter(Boolean))]
    const users = userIds.length > 0 ? await this.userRepo.findByIds(userIds) : []
    const userMap = new Map(users.map(u => [u.id, u]))
    const skillsByDoc = new Map<string, typeof allSkills>()
    for (const s of allSkills) {
      const arr = skillsByDoc.get(s.documentId) || []
      arr.push(s)
      skillsByDoc.set(s.documentId, arr)
    }

    const enriched: EnrichedMatch[] = []
    for (const r of results) {
      const resumeDoc = docMap.get(r.resumeDocId)
      const jobDoc = docMap.get(r.jobDocId)
      if (!resumeDoc || !jobDoc) continue
      const candidate = userMap.get(resumeDoc.userId)
      const company = userMap.get(jobDoc.userId)
      const resumeSkills = (skillsByDoc.get(r.resumeDocId) || []).slice(0, 6)
      const jobSkills = (skillsByDoc.get(r.jobDocId) || []).slice(0, 6)
      const jobParsed = (jobDoc.parsedJson as any)?.structured || {}
      const resumeParsed = (resumeDoc.parsedJson as any)?.structured || {}

      enriched.push({
        id: r.id,
        overallScore: r.overallScore,
        skillMatchScore: r.skillMatchScore,
        cityMatchBonus: r.cityMatchBonus,
        cooccurrenceBonus: r.cooccurrenceBonus || 0,
        hotnessBonus: r.hotnessBonus || 0,
        experienceBonus: r.experienceBonus || 0,
        industryMatchBonus: r.industryMatchBonus || 0,
        trendBonus: r.trendBonus || 0,
        scoreBreakdown: r.scoreBreakdown || null,
        matchDetails: r.matchDetails,
        algorithmTrace: r.algorithmTrace,
        llmAssessment: r.llmAssessment,
        communityContext: r.communityContext,
        createdAt: r.createdAt,
        resumeDocId: r.resumeDocId,
        resumeFilename: resumeDoc.originalFilename,
        candidateName: resumeParsed?.name || candidate?.username || '未知',
        candidateCity: candidate?.city || resumeParsed?.city || '',
        candidateTopSkills: resumeSkills.map(s => s.skillName || s.skill?.name || '').filter(Boolean),
        jobDocId: r.jobDocId,
        jobFilename: jobDoc.originalFilename,
        companyName: company?.companyName || jobParsed?.companyName || jobParsed?.company || '',
        jobTitle: jobParsed?.jobTitle || jobParsed?.title || jobDoc.originalFilename,
        jobCity: company?.city || jobParsed?.location || jobParsed?.city || '',
        jobTopSkills: jobSkills.map(s => s.skillName || s.skill?.name || '').filter(Boolean),
      })
    }
    return enriched
  }

  // ══════════════════════════════════════════════════════════════
  //  Utility (kept for skill matching phase)
  // ══════════════════════════════════════════════════════════════

  private inferImportance(proficiency: string): string {
    const idx = ['beginner', 'intermediate', 'advanced', 'expert'].indexOf(proficiency)
    if (idx >= 2) return 'required'
    if (idx >= 1) return 'preferred'
    return 'optional'
  }

  private nameSimilarity(a: string, b: string): number {
    const al = this.normalizeSkillName(a)
    const bl = this.normalizeSkillName(b)
    if (!al || !bl) return 0
    if (al === bl) return 1.0
    if (al.includes(bl) || bl.includes(al)) {
      const ratio = Math.min(al.length, bl.length) / Math.max(al.length, bl.length)
      return 0.75 + ratio * 0.25
    }
    const maxLen = Math.max(al.length, bl.length)
    const dist = this.levenshtein(al, bl)
    const sim = 1 - dist / maxLen
    if (maxLen < 5) return sim >= 0.8 ? sim : 0
    return sim >= 0.6 ? sim : 0
  }

  private normalizeSkillName(name: string): string {
    let s = name.toLowerCase()
      .replace(/\.(js|ts|jsx|tsx|py|java|go|rb|cs|swift|kt|rs|cpp|c)$/i, '')
      .replace(/\s?(framework|library|tool|platform|engine|language|api|sdk)$/i, '')
      .replace(/[^a-z0-9一-鿿+#.]/g, '')
    const suffixes = ['系统开发', '开发', '设计', '框架', '技术', '平台', '工具', '应用', '编程', '语言', '算法', '模型', '架构', '服务', '组件', '引擎', '系统', '方案', '流程', '管理', '分析', '测试', '部署', '优化', '配置', '实现', '封装']
    const sorted = [...suffixes].sort((x, y) => y.length - x.length)
    for (const suffix of sorted) {
      if (s.endsWith(suffix) && s.length > suffix.length + 1) { s = s.slice(0, -suffix.length); break }
    }
    return s
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length; const n = b.length
    let prev = Array.from({ length: n + 1 }, (_, j) => j)
    let curr = new Array(n + 1)
    for (let i = 1; i <= m; i++) {
      curr[0] = i
      for (let j = 1; j <= n; j++) {
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
      ;[prev, curr] = [curr, prev]
    }
    return prev[n]
  }
}
