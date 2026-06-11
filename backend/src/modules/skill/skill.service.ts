import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, ILike } from 'typeorm'
import { Skill } from './skill.entity'
import { Neo4jService } from '../graph/neo4j.service'

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,
    private neo4j: Neo4jService,
  ) {}

  async findAll(opts: { page: number; pageSize: number; search?: string }) {
    const where = opts.search ? { name: ILike(`%${opts.search}%`) } : {}
    const [items, total] = await this.skillRepo.findAndCount({
      where,
      order: { id: 'ASC' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    })
    return { items, total, page: opts.page, pageSize: opts.pageSize }
  }

  async findById(id: number): Promise<Skill> {
    const skill = await this.skillRepo.findOne({ where: { id } })
    if (!skill) throw new NotFoundException('技能不存在')
    return skill
  }

  async findByIds(ids: number[]): Promise<Skill[]> {
    return this.skillRepo.findBy(ids.map((id) => ({ id })))
  }

  async getRelatedSkills(skillId: number): Promise<number[]> {
    return this.neo4j.getRelatedSkills(skillId)
  }

  async getFrequency(skillId: number) {
    return this.neo4j.getSkillFrequency(skillId)
  }

  // Sync skill from Neo4j to PostgreSQL
  async syncSkill(skillId: number, neo4jProps: Record<string, unknown>) {
    const existing = await this.skillRepo.findOne({ where: { id: skillId } })
    if (existing) return existing

    const skill = this.skillRepo.create({
      id: skillId,
      name: neo4jProps?.['name'] as string,
      hasStructuralBreak: neo4jProps?.['has_structural_break'] as boolean,
      isLowFrequency: neo4jProps?.['is_low_frequency'] as boolean,
    })
    return this.skillRepo.save(skill)
  }

  async getOrCreate(skillId: number, skillName?: string): Promise<Skill> {
    const existing = await this.skillRepo.findOne({ where: { id: skillId } })
    if (existing) {
      if (skillName && !existing.name) {
        existing.name = skillName
        await this.skillRepo.save(existing)
      }
      return existing
    }

    const skill = this.skillRepo.create({ id: skillId, name: skillName })
    return this.skillRepo.save(skill)
  }

  async getOrCreateBatch(items: Array<{ skillId: number; name: string }>): Promise<Skill[]> {
    if (items.length === 0) return []
    const ids = items.map((i) => i.skillId)
    const existing = await this.skillRepo.findBy(ids.map((id) => ({ id })))
    const existingMap = new Map(existing.map((s) => [s.id, s]))

    const toCreate: Skill[] = []
    for (const item of items) {
      if (!existingMap.has(item.skillId)) {
        toCreate.push(this.skillRepo.create({ id: item.skillId, name: item.name }))
      }
    }

    if (toCreate.length > 0) {
      const created = await this.skillRepo.save(toCreate)
      for (const s of created) existingMap.set(s.id, s)
    }

    return items.map((i) => existingMap.get(i.skillId)!)
  }
}
