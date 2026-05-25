import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MatchResult, MatchDetail } from './match-result.entity'
import { Document } from '../document/document.entity'
import { DocumentSkill } from '../skill/document-skill.entity'
import { Skill } from '../skill/skill.entity'
import { Neo4jService } from '../graph/neo4j.service'
import { User } from '../user/user.entity'

export interface EnrichedMatch {
  id: string
  overallScore: number
  skillMatchScore: number
  cityMatchBonus: number
  matchDetails: MatchDetail[]
  createdAt: Date
  // Resume side
  resumeDocId: string
  resumeFilename: string
  candidateName: string
  candidateCity: string
  candidateTopSkills: string[]
  // Job side
  jobDocId: string
  jobFilename: string
  companyName: string
  jobTitle: string
  jobCity: string
  jobTopSkills: string[]
}

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(MatchResult) private matchRepo: Repository<MatchResult>,
    @InjectRepository(Document) private docRepo: Repository<Document>,
    @InjectRepository(DocumentSkill) private dsRepo: Repository<DocumentSkill>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private neo4j: Neo4jService,
  ) {}

  async calculateMatch(resumeDocId: string, jobDocId: string): Promise<MatchResult> {
    const resumeSkills = await this.dsRepo.find({ where: { documentId: resumeDocId }, relations: ['skill'] })
    const jobSkills = await this.dsRepo.find({ where: { documentId: jobDocId }, relations: ['skill'] })

    const resumeSkillMap = new Map<number, DocumentSkill>()
    for (const ds of resumeSkills) resumeSkillMap.set(ds.skillId, ds)
    const jobSkillMap = new Map<number, DocumentSkill>()
    for (const ds of jobSkills) jobSkillMap.set(ds.skillId, ds)

    const matchDetails: MatchDetail[] = []
    let totalScore = 0
    for (const [skillId, jobSkill] of jobSkillMap) {
      const personSkill = resumeSkillMap.get(skillId)
      if (personSkill) {
        const proficiencyScore = this.calcProficiencyScore(personSkill.proficiency, jobSkill.proficiency)
        matchDetails.push({
          skillId,
          skillName: jobSkill.skillName || jobSkill.skill?.name || `技能 ${skillId}`,
          personProficiency: personSkill.proficiency || 'unknown',
          jobRequirement: jobSkill.proficiency || 'unknown',
          score: proficiencyScore,
        })
        totalScore += proficiencyScore
      }
    }

    const skillMatchScore = jobSkills.length > 0 ? Math.min(100, (totalScore / (jobSkills.length * 100)) * 100) : 0

    let cooccurrenceBonus = 0
    for (const [skillId] of resumeSkillMap) {
      if (!jobSkillMap.has(skillId)) {
        const related = await this.neo4j.getRelatedSkills(skillId, 5)
        for (const relId of related) { if (jobSkillMap.has(relId)) { cooccurrenceBonus += 5; break } }
      }
    }

    let cityMatchBonus = 0
    const resumeDoc = await this.docRepo.findOne({ where: { id: resumeDocId } })
    const jobDoc = await this.docRepo.findOne({ where: { id: jobDocId } })
    if (resumeDoc && jobDoc) {
      const person = await this.userRepo.findOne({ where: { id: resumeDoc.userId } })
      const company = await this.userRepo.findOne({ where: { id: jobDoc.userId } })
      if (person?.city && company?.city && person.city === company.city) cityMatchBonus = 10
    }

    const overallScore = Math.min(100, Math.round((skillMatchScore + cooccurrenceBonus + cityMatchBonus) * 100) / 100)

    return this.matchRepo.save(this.matchRepo.create({
      resumeDocId, jobDocId, overallScore,
      skillMatchScore: Math.round(skillMatchScore * 100) / 100,
      cityMatchBonus, matchDetails,
    }))
  }

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
          const existing = await this.matchRepo.findOne({ where: { resumeDocId: myDoc.id, jobDocId: jobDoc.id } })
          results.push(existing || await this.calculateMatch(myDoc.id, jobDoc.id))
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
          const existing = await this.matchRepo.findOne({ where: { resumeDocId: resumeDoc.id, jobDocId: myJob.id } })
          results.push(existing || await this.calculateMatch(resumeDoc.id, myJob.id))
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
    return this.enrichResults(results)
  }

  async getResult(id: string): Promise<EnrichedMatch> {
    const result = await this.matchRepo.findOneOrFail({ where: { id } })
    const [enriched] = await this.enrichResults([result])
    return enriched
  }

  private async enrichResults(results: MatchResult[]): Promise<EnrichedMatch[]> {
    const enriched: EnrichedMatch[] = []
    for (const r of results) {
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
        matchDetails: r.matchDetails,
        createdAt: r.createdAt,
        resumeDocId: r.resumeDocId,
        resumeFilename: resumeDoc.originalFilename,
        candidateName: resumeParsed?.name || candidate?.username || '未知',
        candidateCity: candidate?.city || resumeParsed?.city || '',
        candidateTopSkills: resumeSkills.map((s) => s.skillName || s.skill?.name || '').filter(Boolean),
        jobDocId: r.jobDocId,
        jobFilename: jobDoc.originalFilename,
        // Prefer user profile companyName, then parsed company, skip bare username
        companyName: company?.companyName || jobParsed?.company || jobParsed?.organization || '',
        jobTitle: jobParsed?.title || jobParsed?.position || jobDoc.originalFilename,
        jobCity: company?.city || jobParsed?.city || '',
        jobTopSkills: jobSkills.map((s) => s.skillName || s.skill?.name || '').filter(Boolean),
      })
    }
    return enriched
  }

  private calcProficiencyScore(person?: string, required?: string): number {
    if (!person || !required) return 50
    const levels = ['beginner', 'intermediate', 'advanced', 'expert']
    const pi = levels.indexOf(person)
    const ri = levels.indexOf(required)
    if (pi === -1 || ri === -1) return 50
    if (pi >= ri) return 100
    if (pi === ri - 1) return 75
    return 50
  }
}
