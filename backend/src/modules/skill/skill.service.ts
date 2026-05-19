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

  async getOrCreate(skillId: number): Promise<Skill> {
    const existing = await this.skillRepo.findOne({ where: { id: skillId } })
    if (existing) return existing

    const skill = this.skillRepo.create({ id: skillId })
    return this.skillRepo.save(skill)
  }
}
