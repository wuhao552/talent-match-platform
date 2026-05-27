import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MatchResult, MatchDetail, ScoreBreakdown } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { Neo4jService } from '../graph/neo4j.service'
import { User } from '../user/user.entity'
import { LlmService } from '../llm/llm.service'

// ── Constants ──

const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert']

/** Importance weights for job skill requirements */
const IMPORTANCE_WEIGHTS: Record<string, number> = {
  required: 1.0,
  preferred: 0.6,
  optional: 0.3,
}

/**
 * Infer importance from the LLM-extracted proficiency.
 * The LLM prompt instructs: "必备技能→advanced/expert, 加分技能→beginner/intermediate".
 * So proficiency level IS the importance signal from the LLM.
 */
function inferImportance(proficiency: string): string {
  const idx = PROFICIENCY_LEVELS.indexOf(proficiency)
  if (idx >= 3) return 'required'   // expert → 必须
  if (idx >= 2) return 'required'   // advanced → 必须
  if (idx >= 1) return 'preferred'  // intermediate → 加分
  return 'optional'                 // beginner → 可选
}

// ── City matching helpers ──

const CHINA_REGIONS: Record<string, string[]> = {
  '华东': ['上海', '南京', '杭州', '宁波', '苏州', '无锡', '合肥', '福州', '厦门', '济南', '青岛', '南昌'],
  '华北': ['北京', '天津', '石家庄', '太原', '呼和浩特', '唐山', '保定'],
  '华南': ['广州', '深圳', '珠海', '东莞', '佛山', '南宁', '海口', '三亚'],
  '华中': ['武汉', '长沙', '郑州', '洛阳', '宜昌'],
  '西南': ['成都', '重庆', '昆明', '贵阳', '拉萨'],
  '西北': ['西安', '兰州', '西宁', '银川', '乌鲁木齐'],
  '东北': ['沈阳', '大连', '长春', '吉林', '哈尔滨'],
}

function normalizeCity(c: string): string {
  return c.replace(/[\s市省区县]/g, '').toLowerCase()
}

function getRegion(city: string): string | null {
  const nc = normalizeCity(city)
  for (const [region, cities] of Object.entries(CHINA_REGIONS)) {
    if (cities.some((c) => nc.startsWith(normalizeCity(c)) || normalizeCity(c).startsWith(nc))) {
      return region
    }
  }
  return null
}

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

interface NamedSkill {
  name: string
  proficiency: string
  skillId?: number
  yearsOfExperience?: number
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
    private llmService: LlmService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  //  Main matching algorithm
  // ══════════════════════════════════════════════════════════════

  async calculateMatch(
    resumeDocId: string,
    jobDocId: string,
    opts: { useLLM?: boolean } = {},
  ): Promise<MatchResult> {
    try {
      return await this._calculateMatchInternal(resumeDocId, jobDocId, opts)
    } catch (err) {
      console.error(
        `[Matching] calculateMatch FAILED for resume=${resumeDocId?.slice(0, 8)} job=${jobDocId?.slice(0, 8)}:`,
        (err as Error).message,
        (err as Error).stack?.split('\n').slice(0, 3).join(' | '),
      )
      // Return a fallback result so the UI doesn't break
      return this.matchRepo.save(
        this.matchRepo.create({
          resumeDocId,
          jobDocId,
          overallScore: 0,
          skillMatchScore: 0,
          cityMatchBonus: 0,
          cooccurrenceBonus: 0,
          hotnessBonus: 0,
          experienceBonus: 0,
          industryMatchBonus: 0,
          trendBonus: 0,
          matchDetails: [],
          scoreBreakdown: {
            skillMatchScore: 0, cooccurrenceBonus: 0, cityMatchBonus: 0,
            hotnessBonus: 0, experienceBonus: 0, industryMatchBonus: 0,
            trendBonus: 0, overallScore: 0,
          },
        }),
      )
    }
  }

  private async _calculateMatchInternal(
    resumeDocId: string,
    jobDocId: string,
    opts: { useLLM?: boolean } = {},
  ): Promise<MatchResult> {
    // ── Phase 0: Load all data ──
    const [resumeSkills, jobSkills, resumeDoc, jobDoc] = await Promise.all([
      this.dsRepo.find({ where: { documentId: resumeDocId }, relations: ['skill'] }),
      this.dsRepo.find({ where: { documentId: jobDocId }, relations: ['skill'] }),
      this.docRepo.findOne({ where: { id: resumeDocId } }),
      this.docRepo.findOne({ where: { id: jobDocId } }),
    ])

    if (!resumeDoc || !jobDoc) {
      throw new Error('Document not found')
    }

    const resumeById = new Map<number, DocumentSkill>()
    for (const ds of resumeSkills) resumeById.set(ds.skillId, ds)

    const jobById = new Map<number, DocumentSkill>()
    for (const ds of jobSkills) jobById.set(ds.skillId, ds)

    // Load Skill entities for hotness/trend metadata
    const allSkillIds = new Set<number>()
    for (const ds of resumeSkills) allSkillIds.add(ds.skillId)
    for (const ds of jobSkills) allSkillIds.add(ds.skillId)

    const skillMetaMap = new Map<number, Skill>()
    if (allSkillIds.size > 0) {
      const skillEntities = await this.skillRepo.findBy([...allSkillIds].map((id) => ({ id })))
      for (const s of skillEntities) skillMetaMap.set(s.id, s)
    }

    // Load unmatched skills (LLM-extracted but no canonical ID)
    const resumeUnmatched = ((resumeDoc.parsedJson as any)?.unmatchedSkills || []) as Array<{
      name: string; proficiency: string; yearsOfExperience?: number
    }>
    const jobUnmatched = ((jobDoc.parsedJson as any)?.unmatchedSkills || []) as Array<{
      name: string; proficiency: string
    }>

    // Load parsed structured data
    const parsedResume = (resumeDoc.parsedJson as any)?.structured || {}
    const parsedJob = (jobDoc.parsedJson as any)?.structured || {}

    const matchDetails: MatchDetail[] = []
    const usedResumeSkillIds = new Set<number>()
    const usedJobSkillIds = new Set<number>()

    // ── Phase 1: ID-based matching ──
    // Use coverage-based scoring: avg proficiency × soft coverage factor
    let totalJobWeight = 0
    let matchedWeight = 0
    let totalProficiencyScore = 0  // sum of proficiency scores (0-100), weighted by importance

    for (const [skillId, jobSkill] of jobById) {
      const importance = inferImportance(jobSkill.proficiency)
      const weight = IMPORTANCE_WEIGHTS[importance] || 0.6
      totalJobWeight += weight

      const resumeSkill = resumeById.get(skillId)
      if (resumeSkill) {
        const profScore = this.calcProficiencyScore(resumeSkill.proficiency, jobSkill.proficiency)
        const skillMeta = skillMetaMap.get(skillId)
        const hotness = skillMeta?.hotness ?? null
        const hotnessFactor = hotness != null ? 0.85 + hotness * 0.3 : 1.0
        const hotnessBoost = Math.round((profScore * (hotnessFactor - 1.0)) * 100) / 100

        matchDetails.push({
          skillId,
          skillName: jobSkill.skillName || jobSkill.skill?.name || `skill-${skillId}`,
          personProficiency: resumeSkill.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          score: Math.round(profScore * weight * hotnessFactor * 100) / 100,
          resumeSkillId: skillId,
          jobSkillId: skillId,
          importance,
          hotnessBoost: Math.round(hotnessBoost * 100) / 100,
        })

        totalProficiencyScore += profScore * weight
        matchedWeight += weight
        usedResumeSkillIds.add(skillId)
        usedJobSkillIds.add(skillId)
      }
    }

    // ── Phase 2: Name-based fuzzy matching ──
    const resumeNamed: NamedSkill[] = [
      ...resumeSkills
        .filter((s) => !usedResumeSkillIds.has(s.skillId))
        .map((s) => ({
          name: s.skillName || s.skill?.name || '',
          proficiency: s.proficiency || 'intermediate',
          skillId: s.skillId,
        })),
      ...resumeUnmatched.map((s) => ({
        name: s.name,
        proficiency: s.proficiency,
        yearsOfExperience: s.yearsOfExperience,
      })),
    ].filter((s) => s.name.length > 0)

    const jobNamed: NamedSkill[] = [
      ...jobSkills
        .filter((s) => !usedJobSkillIds.has(s.skillId))
        .map((s) => ({
          name: s.skillName || s.skill?.name || '',
          proficiency: s.proficiency || 'intermediate',
          skillId: s.skillId,
        })),
      ...jobUnmatched.map((s) => ({ name: s.name, proficiency: s.proficiency })),
    ].filter((s) => s.name.length > 0)

    // Phase 2: Name-based fuzzy matching (same coverage logic)
    const usedResumeNames = new Set<number>()
    const matchedJobNameIndices = new Set<number>()

    for (let ji = 0; ji < jobNamed.length; ji++) {
      const jobReq = jobNamed[ji]
      const importance = inferImportance(jobReq.proficiency)
      const weight = IMPORTANCE_WEIGHTS[importance] || 0.6
      totalJobWeight += weight

      let best: { idx: number; sim: number; score: number; personSkill: NamedSkill } | null = null
      for (let i = 0; i < resumeNamed.length; i++) {
        if (usedResumeNames.has(i)) continue
        const sim = this.nameSimilarity(jobReq.name, resumeNamed[i].name)
        if (sim >= 0.5 && (!best || sim > best.sim)) {
          const profScore = this.calcProficiencyScore(resumeNamed[i].proficiency, jobReq.proficiency)
          best = { idx: i, sim, score: profScore, personSkill: resumeNamed[i] }
        }
      }
      if (best) {
        usedResumeNames.add(best.idx)
        matchedJobNameIndices.add(ji)
        matchDetails.push({
          skillId: -(Math.round(best.sim * 100)),
          skillName: `${best.personSkill.name} ↔ ${jobReq.name}`,
          personProficiency: best.personSkill.proficiency,
          jobRequirement: jobReq.proficiency,
          score: Math.round(best.score * best.sim * weight * 100) / 100,
          resumeSkillId: best.personSkill.skillId,
          jobSkillId: jobReq.skillId,
          importance,
        })

        totalProficiencyScore += best.score * weight
        matchedWeight += weight
      }
    }

    // ── Phase 2.5: Category-based cross-matching ──
    for (let ji = 0; ji < jobNamed.length; ji++) {
      if (matchedJobNameIndices.has(ji)) continue
      const jobReq = jobNamed[ji]
      // totalJobWeight already counted in Phase 2, don't double-count
      const importance = inferImportance(jobReq.proficiency)
      const weight = IMPORTANCE_WEIGHTS[importance] || 0.6

      const jobCat = jobReq.skillId != null ? skillMetaMap.get(jobReq.skillId)?.category : null
      if (!jobCat) continue

      for (let i = 0; i < resumeNamed.length; i++) {
        if (usedResumeNames.has(i)) continue
        const rCat = resumeNamed[i].skillId != null ? skillMetaMap.get(resumeNamed[i].skillId!)?.category : null
        if (rCat && rCat === jobCat) {
          usedResumeNames.add(i)
          matchedJobNameIndices.add(ji)
          const profScore = this.calcProficiencyScore(resumeNamed[i].proficiency, jobReq.proficiency)
          const catScore = profScore * weight * 0.55

          matchDetails.push({
            skillId: -900,
            skillName: `${resumeNamed[i].name} ≫ ${jobReq.name} [${jobCat}]`,
            personProficiency: resumeNamed[i].proficiency,
            jobRequirement: jobReq.proficiency,
            score: Math.round(catScore * 100) / 100,
            resumeSkillId: resumeNamed[i].skillId,
            jobSkillId: jobReq.skillId,
            importance,
          })

          totalProficiencyScore += profScore * weight * 0.55
          matchedWeight += weight * 0.55
          break
        }
      }
    }

    // ── Phase 2.6: LLM semantic matching for remaining unmatched pairs ──
    const stillUnmatchedJob = jobNamed.filter((_, i) => !matchedJobNameIndices.has(i))
    const stillUnusedResume = resumeNamed.filter((_, i) => !usedResumeNames.has(i))

    if (opts.useLLM && stillUnmatchedJob.length > 0 && stillUnusedResume.length > 0) {
      try {
        const semanticMatches = await this.llmSemanticMatch(stillUnmatchedJob, stillUnusedResume)
        for (const sm of semanticMatches) {
          const jobReq = stillUnmatchedJob[sm.jobIdx]
          const resumeSkill = stillUnusedResume[sm.resumeIdx]
          if (usedResumeNames.has(sm.resumeIdx) || matchedJobNameIndices.has(sm.jobIdx)) continue

          const importance = inferImportance(jobReq.proficiency)
          const weight = IMPORTANCE_WEIGHTS[importance] || 0.6
          const profScore = this.calcProficiencyScore(resumeSkill.proficiency, jobReq.proficiency)
          const semScore = profScore * weight * sm.confidence

          usedResumeNames.add(sm.resumeIdx)
          matchedJobNameIndices.add(sm.jobIdx)

          matchDetails.push({
            skillId: -800,
            skillName: `${resumeSkill.name} ⇄ ${jobReq.name}`,
            personProficiency: resumeSkill.proficiency,
            jobRequirement: jobReq.proficiency,
            score: Math.round(semScore * 100) / 100,
            resumeSkillId: resumeSkill.skillId,
            jobSkillId: jobReq.skillId,
            importance,
          })

          totalProficiencyScore += profScore * weight * sm.confidence
          matchedWeight += weight * sm.confidence
        }
      } catch (err) {
        console.warn(`[Matching] LLM semantic matching failed: ${(err as Error).message}`)
      }
    }
    // Avg proficiency of matched skills × soft coverage factor
    // coverageFactor = 0.55 + 0.45 × coverage  (range: 0.55–1.0, sqrt-like floor)
    const avgProficiency = matchedWeight > 0 ? totalProficiencyScore / matchedWeight : 0
    const coverage = totalJobWeight > 0 ? matchedWeight / totalJobWeight : 0
    const coverageFactor = 0.55 + 0.45 * coverage
    const skillMatchScore = totalJobWeight > 0
      ? Math.round(avgProficiency * coverageFactor * 100) / 100
      : 0

    // ── Phase 4: Batch co-occurrence bonus ──
    let cooccurrenceBonus = 0
    const COOCCUR_CAP = 15

    // Build sets of IDs for various directions
    const resumeExtraIds = [...resumeById.keys()].filter((id) => !jobById.has(id))
    const jobUnmatchedIds = [...jobById.keys()].filter((id) => !usedJobSkillIds.has(id))
    const matchedResumeIds = [...resumeById.keys()].filter((id) => usedResumeSkillIds.has(id))
    const matchedJobIds = [...jobById.keys()].filter((id) => usedJobSkillIds.has(id))

    const allCoocEdges: Array<{ source: number; target: number; freq: number }> = []

    // Direction A: extra resume skills ↔ all job skills (hidden extra skills)
    if (resumeExtraIds.length > 0 && jobById.size > 0) {
      const edges = await this.neo4j.batchGetCooccurrences(resumeExtraIds, [...jobById.keys()])
      allCoocEdges.push(...edges.map((e) => ({ source: e.sourceId, target: e.targetId, freq: e.freqSkill })))
    }

    // Direction B: unmatched job skills ↔ matched resume skills (near-miss)
    if (jobUnmatchedIds.length > 0 && matchedResumeIds.length > 0) {
      const edges = await this.neo4j.batchGetCooccurrences(jobUnmatchedIds, matchedResumeIds)
      allCoocEdges.push(...edges.map((e) => ({ source: e.sourceId, target: e.targetId, freq: e.freqSkill })))
    }

    // Direction C: co-occurrence among matched skill pairs (reinforcement bonus)
    if (matchedResumeIds.length > 1 && matchedJobIds.length > 1) {
      const edges = await this.neo4j.batchGetCooccurrences(matchedResumeIds, matchedJobIds)
      allCoocEdges.push(...edges.map((e) => ({ source: e.sourceId, target: e.targetId, freq: e.freqSkill })))
    }

    const coocSeen = new Set<string>()
    for (const e of allCoocEdges) {
      const key = `${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`
      if (coocSeen.has(key)) continue
      coocSeen.add(key)
      const logFreq = Math.log(Math.max(e.freq, 1))
      cooccurrenceBonus += Math.min(2, logFreq / Math.log(50) * 2)
    }
    cooccurrenceBonus = Math.round(Math.min(COOCCUR_CAP, cooccurrenceBonus) * 100) / 100

    // ── Phase 5: Skill hotness bonus ──
    let hotnessBonus = 0
    const HOTNESS_CAP = 15
    for (const [skillId] of jobById) {
      if (resumeById.has(skillId)) {
        const meta = skillMetaMap.get(skillId)
        if (meta?.hotness != null && meta.hotness > 0) {
          // Baseline 0.3 per matched skill, up to 1.5 for very hot skills
          hotnessBonus += 0.3 + Math.min(1.2, meta.hotness * 4)
        }
      }
    }
    // Extra hot skills boost
    for (const [skillId] of resumeById) {
      if (!jobById.has(skillId)) {
        const meta = skillMetaMap.get(skillId)
        if (meta?.hotness != null && meta.hotness > 0.2) {
          hotnessBonus += Math.min(0.8, meta.hotness * 2)
        }
      }
    }
    hotnessBonus = Math.round(Math.min(HOTNESS_CAP, hotnessBonus) * 100) / 100

    // ── Phase 6: Experience bonus ──
    let experienceBonus = 0
    const EXP_CAP = 5

    // Extract resume total experience years from multiple possible sources
    let totalResumeYrs = 0

    // Source 1: structured experience array with years/duration/dates
    const resumeExp = (parsedResume as any)?.experience
    if (Array.isArray(resumeExp) && resumeExp.length > 0) {
      for (const exp of resumeExp) {
        const yrs = Number(exp.years || exp.duration || 0)
        if (yrs > 0) { totalResumeYrs += yrs; continue }
        // Try to compute from start/end dates
        const start = exp.start || exp.startDate || ''
        const end = exp.end || exp.endDate || ''
        const startYr = parseInt(String(start).match(/(\d{4})/)?.[1] || '0')
        const endYr = parseInt(String(end).match(/(\d{4})/)?.[1] || String(new Date().getFullYear()))
        if (startYr > 1990 && endYr >= startYr) {
          totalResumeYrs += endYr - startYr
        }
      }
    }

    // Source 2: top-level years/workYears/totalYears field
    if (totalResumeYrs === 0) {
      totalResumeYrs = Number((parsedResume as any)?.workYears || (parsedResume as any)?.totalYears || 0)
    }

    // Source 3: extract from resume summary/description text
    if (totalResumeYrs === 0) {
      const resumeSummary = String((parsedResume as any)?.summary || (parsedResume as any)?.description || resumeDoc.parsedText || '')
      const yrMatch = resumeSummary.match(/(\d+)\s*年(以上|工作|经验|从业)/)
      if (yrMatch) totalResumeYrs = Number(yrMatch[1])
    }

    // Extract expected years from job
    let expectedYrs = 0
    const jobExp = (parsedJob as any)?.experience
    if (Array.isArray(jobExp) && jobExp.length > 0) {
      for (const exp of jobExp) {
        expectedYrs = Math.max(expectedYrs, Number(exp.years || exp.duration || 0))
      }
    }
    if (expectedYrs === 0) {
      const jobSummary = String((parsedJob as any)?.summary || (parsedJob as any)?.description || jobDoc.parsedText || '')
      const yrMatch = jobSummary.match(/(\d+)\s*年(以上|及以上|经验|工作经验)/)
      if (yrMatch) expectedYrs = Number(yrMatch[1])
    }

    if (totalResumeYrs > 0 && expectedYrs > 0) {
      if (totalResumeYrs >= expectedYrs * 2) experienceBonus = EXP_CAP
      else if (totalResumeYrs >= expectedYrs) experienceBonus = Math.min(EXP_CAP, (totalResumeYrs / expectedYrs) * 3)
      else experienceBonus = Math.max(0, ((totalResumeYrs / expectedYrs) - 0.5) * 3)
    } else if (totalResumeYrs > 0 && expectedYrs === 0) {
      // Job doesn't specify experience — give partial bonus based on candidate's experience
      experienceBonus = Math.min(EXP_CAP, Math.log2(totalResumeYrs + 1))
    }
    experienceBonus = Math.round(experienceBonus * 100) / 100

    // ── Phase 7: City match ──
    let cityMatchBonus = 0
    const [person, company] = await Promise.all([
      this.userRepo.findOne({ where: { id: resumeDoc.userId } }),
      this.userRepo.findOne({ where: { id: jobDoc.userId } }),
    ])

    const resumeCityRaw = person?.city || parsedResume.city || ''
    const jobCityRaw = company?.city || parsedJob.city || parsedJob.location || ''
    const resumeCity = normalizeCity(resumeCityRaw)
    const jobCity = normalizeCity(jobCityRaw)

    if (resumeCity && jobCity) {
      // Check exact city match
      if (resumeCity === jobCity) {
        cityMatchBonus = 10
      } else {
        // Check same region
        const resumeRegion = getRegion(resumeCityRaw)
        const jobRegion = getRegion(jobCityRaw)
        if (resumeRegion && jobRegion && resumeRegion === jobRegion) {
          cityMatchBonus = 5
        }
      }
    }

    // Check intendedCities
    if (cityMatchBonus === 0) {
      const intendedCities = person?.intendedCities || parsedResume.intendedCities || []
      if (Array.isArray(intendedCities) && intendedCities.length > 0) {
        const matchedIntended = intendedCities.some(
          (ic: string) => normalizeCity(ic) === jobCity,
        )
        if (matchedIntended) cityMatchBonus = 8
      }
    }

    // Remote job check
    const jobLocation = (parsedJob.location || parsedJob.city || jobCityRaw).toLowerCase()
    if (jobLocation.includes('远程') || jobLocation.includes('remote')) {
      cityMatchBonus = 5 // neutral bonus for remote
    }

    // ── Phase 8: Industry + Category match ──
    let industryMatchBonus = 0
    const INDUSTRY_CAP = 5
    const occProfiles = this.loadOccupationProfiles()
    if (occProfiles) {
      // Collect skill names from ALL sources
      const resumeSkillNames = new Set<string>()
      for (const ds of resumeSkills) {
        const name = (ds.skillName || ds.skill?.name || '').toLowerCase().trim()
        if (name) resumeSkillNames.add(name)
      }
      for (const s of resumeUnmatched) {
        if (s.name) resumeSkillNames.add(s.name.toLowerCase().trim())
      }
      const parsedResumeSkills = (parsedResume as any)?.skills || []
      for (const s of parsedResumeSkills) {
        if (s.name) resumeSkillNames.add(String(s.name).toLowerCase().trim())
      }

      const jobSkillNames = new Set<string>()
      for (const ds of jobSkills) {
        const name = (ds.skillName || ds.skill?.name || '').toLowerCase().trim()
        if (name) jobSkillNames.add(name)
      }
      for (const s of jobUnmatched) {
        if (s.name) jobSkillNames.add(s.name.toLowerCase().trim())
      }
      const parsedJobSkills = (parsedJob as any)?.skills || []
      for (const s of parsedJobSkills) {
        if (s.name) jobSkillNames.add(String(s.name).toLowerCase().trim())
      }

      const resumeOccs = this.findTopOccupationsByName(resumeSkillNames, occProfiles, 5)
      const jobOccs = this.findTopOccupationsByName(jobSkillNames, occProfiles, 5)

      const exactOverlap = resumeOccs.filter((o) => jobOccs.includes(o))
      industryMatchBonus = Math.min(INDUSTRY_CAP, exactOverlap.length * 2.0)

      if (industryMatchBonus === 0 && resumeOccs.length > 0 && jobOccs.length > 0) {
        const resumeTop = resumeOccs[0]
        const jobTop = jobOccs.slice(0, 3)
        if (jobTop.includes(resumeTop)) industryMatchBonus = 1.0
      }
    }

    // ── Phase 8.5: Category diversity bonus (bolted onto industry score) ──
    // Collect categories from matched skills (on BOTH sides)
    const resumeCats = new Set<string>()
    const jobCats = new Set<string>()
    for (const [skillId] of resumeById) {
      if (usedResumeSkillIds.has(skillId)) {
        const cat = skillMetaMap.get(skillId)?.category
        if (cat) resumeCats.add(cat)
      }
    }
    for (const [skillId] of jobById) {
      if (usedJobSkillIds.has(skillId)) {
        const cat = skillMetaMap.get(skillId)?.category
        if (cat) jobCats.add(cat)
      }
    }
    // Also check fuzzy-matched skills' categories
    for (const d of matchDetails) {
      if (d.resumeSkillId && usedResumeSkillIds.has(d.resumeSkillId)) {
        const cat = skillMetaMap.get(d.resumeSkillId)?.category
        if (cat) resumeCats.add(cat)
      }
    }

    // Category overlap: shared categories between resume and job matched skills
    const catOverlap = [...resumeCats].filter((c) => jobCats.has(c))
    // Bonus: each overlapping category +0.5, unique job categories covered +0.5
    const catBonus = Math.min(2, catOverlap.length * 0.5 + (resumeCats.size >= 3 ? 0.5 : 0))
    industryMatchBonus = Math.min(INDUSTRY_CAP, industryMatchBonus + catBonus)
    industryMatchBonus = Math.round(industryMatchBonus * 100) / 100

    // ── Phase 9: Trend bonus ──
    let trendBonus = 0
    const TREND_CAP = 5
    // Include ALL matched skills: both ID-matched and fuzzy-matched
    const allMatchedSkillIds = new Set<number>()
    for (const d of matchDetails) {
      if (d.resumeSkillId != null) allMatchedSkillIds.add(d.resumeSkillId)
      if (d.jobSkillId != null) allMatchedSkillIds.add(d.jobSkillId)
    }

    for (const skillId of allMatchedSkillIds) {
      const meta = skillMetaMap.get(skillId)
      if (meta?.demandTrend != null && meta.demandTrend > -0.15) {
        // Base 0.2 for stable skills, up to 1.0 for high-growth skills
        trendBonus += 0.2 + Math.min(0.8, Math.max(0, meta.demandTrend) * 3)
      }
    }
    trendBonus = Math.round(Math.min(TREND_CAP, trendBonus) * 100) / 100

    // ── Phase 10: Combine final score ──
    // Skill match contributes up to 60, bonuses up to 40
    const overallScore = Math.min(100, Math.round(
      (skillMatchScore * 0.60 + cooccurrenceBonus + cityMatchBonus +
       hotnessBonus + experienceBonus + industryMatchBonus + trendBonus) * 100
    ) / 100)

    // Diagnostic log
    const hotSample = skillMetaMap.size > 0
      ? [...skillMetaMap.values()].filter((s) => s.hotness != null).length
      : 0
    const trendSample = skillMetaMap.size > 0
      ? [...skillMetaMap.values()].filter((s) => s.demandTrend != null).length
      : 0
    const _occProfiles = this.loadOccupationProfiles()
    const occCount = _occProfiles ? Object.keys(_occProfiles).length : 0
    console.log(
      `[Matching] resume=${resumeDocId.slice(0, 8)} job=${jobDocId.slice(0, 8)} | ` +
      `matched=${matchDetails.length} jobSkills=${jobById.size} resumeSkills=${resumeById.size} | ` +
      `skillScore=${skillMatchScore.toFixed(1)} | ` +
      `cooc=${cooccurrenceBonus} | ` +
      `hot=${hotnessBonus} (meta=${skillMetaMap.size} hasHot=${hotSample}) | ` +
      `exp=${experienceBonus} (resumeYrs=${totalResumeYrs} expectYrs=${expectedYrs}) | ` +
      `industry=${industryMatchBonus} (occs=${occCount}) | ` +
      `trend=${trendBonus} (hasTrend=${trendSample}) | ` +
      `overall=${overallScore}%`,
    )

    const scoreBreakdown: ScoreBreakdown = {
      skillMatchScore: Math.round(skillMatchScore * 100) / 100,
      cooccurrenceBonus,
      cityMatchBonus,
      hotnessBonus,
      experienceBonus,
      industryMatchBonus,
      trendBonus,
      overallScore,
    }

    // Upsert: update existing match for this pair, or create new
    let match = await this.matchRepo.findOne({
      where: { resumeDocId, jobDocId },
      order: { createdAt: 'DESC' },
    })
    if (match) {
      match.overallScore = overallScore
      match.skillMatchScore = Math.round(skillMatchScore * 100) / 100
      match.cityMatchBonus = cityMatchBonus
      match.cooccurrenceBonus = cooccurrenceBonus
      match.hotnessBonus = hotnessBonus
      match.experienceBonus = experienceBonus
      match.industryMatchBonus = industryMatchBonus
      match.trendBonus = trendBonus
      match.matchDetails = matchDetails
      match.scoreBreakdown = scoreBreakdown
      match.staleAt = null as any
      return this.matchRepo.save(match)
    }
    return this.matchRepo.save(
      this.matchRepo.create({
        resumeDocId,
        jobDocId,
        overallScore,
        skillMatchScore: Math.round(skillMatchScore * 100) / 100,
        cityMatchBonus,
        cooccurrenceBonus,
        hotnessBonus,
        experienceBonus,
        industryMatchBonus,
        trendBonus,
        matchDetails,
        scoreBreakdown,
      }),
    )
  }

  // ══════════════════════════════════════════════════════════════
  //  Recommend & query methods
  // ══════════════════════════════════════════════════════════════

  async recommend(userId: string, userRole: string): Promise<EnrichedMatch[]> {
    const results: MatchResult[] = []
    const seen = new Set<string>()

    if (userRole === 'individual') {
      const myDocs = await this.docRepo.find({ where: { userId, docType: 'resume', status: 'parsed' } })
      if (myDocs.length === 0) return []

      const jobDocs = await this.docRepo.find({ where: { docType: 'job_description', status: 'parsed' } })
      for (const myDoc of myDocs) {
        for (const jobDoc of jobDocs) {
          const key = `${myDoc.id}-${jobDoc.id}`
          if (seen.has(key)) continue
          seen.add(key)

          // Check if there's a non-stale cached result
          const existing = await this.matchRepo.findOne({
            where: { resumeDocId: myDoc.id, jobDocId: jobDoc.id },
            order: { createdAt: 'DESC' },
          })
          if (existing && existing.staleAt == null) {
            results.push(existing)
          } else {
            try {
              results.push(await this.calculateMatch(myDoc.id, jobDoc.id))
            } catch (err) {
              console.error(`[Matching] calculateMatch failed for resume=${myDoc.id.slice(0, 8)} job=${jobDoc.id.slice(0, 8)}: ${(err as Error).message}`)
            }
          }
        }
      }
    } else {
      const myJobs = await this.docRepo.find({ where: { userId, docType: 'job_description', status: 'parsed' } })
      if (myJobs.length === 0) return []

      const resumeDocs = await this.docRepo.find({ where: { docType: 'resume', status: 'parsed' } })
      for (const myJob of myJobs) {
        for (const resumeDoc of resumeDocs) {
          const key = `${resumeDoc.id}-${myJob.id}`
          if (seen.has(key)) continue
          seen.add(key)

          const existing = await this.matchRepo.findOne({
            where: { resumeDocId: resumeDoc.id, jobDocId: myJob.id },
          })
          if (existing && existing.staleAt == null) {
            results.push(existing)
          } else {
            try {
              results.push(await this.calculateMatch(resumeDoc.id, myJob.id))
            } catch (err) {
              console.error(`[Matching] calculateMatch failed for resume=${resumeDoc.id.slice(0, 8)} job=${myJob.id.slice(0, 8)}: ${(err as Error).message}`)
            }
          }
        }
      }
    }

    return this.enrichResults(results.sort((a, b) => b.overallScore - a.overallScore))
  }

  async getResults(userId: string): Promise<EnrichedMatch[]> {
    const results = await this.matchRepo
      .createQueryBuilder('mr')
      .leftJoinAndSelect('mr.resumeDoc', 'resume')
      .leftJoinAndSelect('mr.jobDoc', 'job')
      .where('resume.userId = :userId', { userId })
      .orWhere('job.userId = :userId', { userId })
      .orderBy('mr.createdAt', 'DESC')
      .getMany()
    // Dedup: keep only latest match per pair
    const seen = new Set<string>()
    const deduped = results.filter((r) => {
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

  /** Mark all match results containing a given document as stale */
  async invalidateByDocument(documentId: string): Promise<void> {
    await this.matchRepo
      .createQueryBuilder()
      .update()
      .set({ staleAt: () => 'NOW()' })
      .where('resumeDocId = :id OR jobDocId = :id', { id: documentId })
      .execute()
  }

  // ══════════════════════════════════════════════════════════════
  //  Enrichment helpers
  // ══════════════════════════════════════════════════════════════

  private async enrichResults(results: MatchResult[]): Promise<EnrichedMatch[]> {
    const enriched: EnrichedMatch[] = []
    for (const r of results) {
      try {
        const [resumeDoc, jobDoc] = await Promise.all([
          this.docRepo.findOne({ where: { id: r.resumeDocId } }),
          this.docRepo.findOne({ where: { id: r.jobDocId } }),
        ])
        if (!resumeDoc || !jobDoc) continue

      const [candidate, company] = await Promise.all([
        this.userRepo.findOne({ where: { id: resumeDoc.userId } }),
        this.userRepo.findOne({ where: { id: jobDoc.userId } }),
      ])

      const [resumeSkills, jobSkills] = await Promise.all([
        this.dsRepo.find({ where: { documentId: r.resumeDocId }, take: 6 }),
        this.dsRepo.find({ where: { documentId: r.jobDocId }, take: 6 }),
      ])

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
        createdAt: r.createdAt,
        resumeDocId: r.resumeDocId,
        resumeFilename: resumeDoc.originalFilename,
        candidateName: resumeParsed?.name || candidate?.username || '未知',
        candidateCity: candidate?.city || resumeParsed?.city || '',
        candidateTopSkills: resumeSkills.map((s) => s.skillName || s.skill?.name || '').filter(Boolean),
        jobDocId: r.jobDocId,
        jobFilename: jobDoc.originalFilename,
        companyName: company?.companyName || jobParsed?.companyName || jobParsed?.company || '',
        jobTitle: jobParsed?.jobTitle || jobParsed?.title || jobDoc.originalFilename,
        jobCity: company?.city || jobParsed?.location || jobParsed?.city || '',
        jobTopSkills: jobSkills.map((s) => s.skillName || s.skill?.name || '').filter(Boolean),
      })
      } catch (err) {
        console.error(`[Matching] enrichResult failed for match=${r.id}: ${(err as Error).message}`)
        // continue to next result
      }
    }
    return enriched
  }

  // ══════════════════════════════════════════════════════════════
  //  LLM semantic matching
  // ══════════════════════════════════════════════════════════════

  private async llmSemanticMatch(
    jobSkills: NamedSkill[],
    resumeSkills: NamedSkill[],
  ): Promise<Array<{ jobIdx: number; resumeIdx: number; confidence: number }>> {
    if (jobSkills.length === 0 || resumeSkills.length === 0) return []

    const jobList = jobSkills.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
    const resumeList = resumeSkills.map((s, i) => `${i + 1}. ${s.name}`).join('\n')

    const prompt = `判断以下岗位技能(A)和候选人技能(B)之间是否存在语义等价关系（同一技能的不同表述）。返回JSON数组，只包含确实等价的匹配对。

岗位技能(A):
${jobList}

候选人技能(B):
${resumeList}

规则：
- 同义/翻译/缩写视为等价：如"K8s"="Kubernetes"，"agent工作流设计"="智能体工作流编排"
- 子领域/包含关系也算等价：如"YOLO目标检测"⊂"目标检测"
- 不要强行匹配不相关的技能
- confidence: 0.85-1.0表示高度等价，0.7-0.84表示相关但不等价

返回纯JSON数组：
[{"a": 编号, "b": 编号, "confidence": 0.9}, ...]`

    try {
      const result = await this.llmService.callLLMForJsonArrayStream(
        '你是技能语义匹配专家。只返回JSON数组。', prompt,
      )
      const matches: Array<{ jobIdx: number; resumeIdx: number; confidence: number }> = []
      for (const item of result) {
        const a = Number(item.a || item.jobIdx) - 1 // 1-indexed → 0-indexed
        const b = Number(item.b || item.resumeIdx) - 1
        const conf = Number(item.confidence) || 0.8
        if (a >= 0 && a < jobSkills.length && b >= 0 && b < resumeSkills.length && conf >= 0.7) {
          matches.push({ jobIdx: a, resumeIdx: b, confidence: conf })
        }
      }
      return matches
    } catch (err) {
      console.warn(`[Matching] LLM semantic matching error: ${(err as Error).message}`)
      return []
    }
  }

  private calcProficiencyScore(person?: string, required?: string): number {
    if (!person || !required) return 75
    const pi = PROFICIENCY_LEVELS.indexOf(person)
    const ri = PROFICIENCY_LEVELS.indexOf(required)
    if (pi === -1 || ri === -1) return 75
    if (pi >= ri) return 100
    if (pi === ri - 1) return 92
    if (pi === ri - 2) return 85
    return 78
  }

  /**
   * Hybrid string similarity: combines substring containment with edit-distance.
   * Returns 0-1 where >= 0.8 is strong match, >= 0.6 is plausible.
   */
  private nameSimilarity(a: string, b: string): number {
    const al = this.normalizeSkillName(a)
    const bl = this.normalizeSkillName(b)
    if (!al || !bl) return 0

    // Exact match
    if (al === bl) return 1.0

    // Substring containment
    if (al.includes(bl) || bl.includes(al)) {
      const ratio = Math.min(al.length, bl.length) / Math.max(al.length, bl.length)
      return 0.75 + ratio * 0.25
    }

    // Edit-distance similarity
    const maxLen = Math.max(al.length, bl.length)
    const dist = this.levenshtein(al, bl)
    const sim = 1 - dist / maxLen

    if (maxLen < 5) return sim >= 0.8 ? sim : 0
    return sim >= 0.6 ? sim : 0
  }

  /** Normalize skill names for comparison */
  private normalizeSkillName(name: string): string {
    // English suffixes
    let s = name.toLowerCase()
      .replace(/\.(js|ts|jsx|tsx|py|java|go|rb|cs|swift|kt|rs|cpp|c)$/i, '')
      .replace(/\s?(framework|library|tool|platform|engine|language|api|sdk)$/i, '')
      .replace(/[^a-z0-9一-鿿+#.]/g, '')

    // Chinese suffixes
    const suffixes = [
      '系统开发', '开发', '设计', '框架',
      '技术', '平台', '工具', '应用',
      '编程', '语言', '算法', '模型',
      '架构', '服务', '组件', '引擎',
      '系统', '方案', '流程', '管理',
      '分析', '测试', '部署', '优化',
      '配置', '实现', '封装',
    ]
    const sorted = [...suffixes].sort((x, y) => y.length - x.length)
    for (const suffix of sorted) {
      if (s.endsWith(suffix) && s.length > suffix.length + 1) {
        s = s.slice(0, -suffix.length)
        break
      }
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

  // ══════════════════════════════════════════════════════════════
  //  Industry / occupation matching
  // ══════════════════════════════════════════════════════════════

  private _occupationProfilesCache: any = null

  private loadOccupationProfiles(): any {
    if (this._occupationProfilesCache) return this._occupationProfilesCache
    try {
      const fs = require('fs')
      const path = require('path')
      const profilesPath = path.resolve(
        process.env.ENTITY_MAP_DIR || path.join(__dirname, '../../../data/entity_map'),
        'occupation_profiles.json',
      )
      if (fs.existsSync(profilesPath)) {
        this._occupationProfilesCache = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'))
        console.log(`[Matching] Loaded occupation profiles: ${Object.keys(this._occupationProfilesCache).length} occupations`)
        return this._occupationProfilesCache
      } else {
        console.warn(`[Matching] Occupation profiles not found at: ${profilesPath}`)
      }
    } catch (err) {
      console.warn(`[Matching] Failed to load occupation profiles: ${(err as Error).message}`)
    }
    return null
  }

  private findTopOccupations(skillIds: number[], profiles: any, topN: number): string[] {
    const scores = new Map<string, number>()
    for (const [occId, profile] of Object.entries(profiles) as [string, any][]) {
      let score = 0
      const topSkills: number[] = (profile.topSkills || []).map((s: any) => s.skill_id)
      for (const sid of skillIds) {
        const idx = topSkills.indexOf(sid)
        if (idx >= 0) score += 1 - idx / topSkills.length
      }
      if (score > 0) scores.set(occId, score)
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map((e) => e[0])
  }

  /** Match occupations by skill NAMES (robust against imprecise canonical ID resolution) */
  private findTopOccupationsByName(skillNames: Set<string>, profiles: any, topN: number): string[] {
    const scores = new Map<string, number>()
    for (const [occId, profile] of Object.entries(profiles) as [string, any][]) {
      let score = 0
      const topSkills: Array<{ skill_name: string; total_demand_6m: number }> = profile.topSkills || []
      for (let i = 0; i < topSkills.length; i++) {
        const occSkillName = (topSkills[i].skill_name || '').toLowerCase()
        if (!occSkillName) continue
        // Check if any resume/job skill name overlaps with this occupation skill
        for (const name of skillNames) {
          if (name.includes(occSkillName) || occSkillName.includes(name)) {
            score += (1 - i / topSkills.length) * (topSkills[i].total_demand_6m || 1)
          }
        }
      }
      if (score > 0) scores.set(occId, score)
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map((e) => e[0])
  }
}
