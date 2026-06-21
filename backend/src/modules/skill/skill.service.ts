import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Skill } from './skill.entity';

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,
  ) {}

  async findAll(opts: { page: number; pageSize: number; search?: string }) {
    const where = opts.search ? { name: ILike(`%${opts.search}%`) } : {};
    const [items, total] = await this.skillRepo.findAndCount({
      where,
      order: { id: 'ASC' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    });
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async findById(id: number): Promise<Skill> {
    const skill = await this.skillRepo.findOne({ where: { id } });
    if (!skill) throw new NotFoundException('技能不存在');
    return skill;
  }

  async findByIds(ids: number[]): Promise<Skill[]> {
    return this.skillRepo.findBy(ids.map((id) => ({ id })));
  }

  async getRelatedSkills(): Promise<number[]> {
    return []
  }

  async getFrequency(): Promise<Record<string, number>> {
    return {}
  }

  // Sync skill from Neo4j to PostgreSQL
  async syncSkill(skillId: number, neo4jProps: Record<string, unknown>) {
    const existing = await this.skillRepo.findOne({ where: { id: skillId } });
    if (existing) return existing;

    const skill = this.skillRepo.create({
      id: skillId,
      name: neo4jProps?.['name'] as string,
      hasStructuralBreak: neo4jProps?.['has_structural_break'] as boolean,
      isLowFrequency: neo4jProps?.['is_low_frequency'] as boolean,
    });
    return this.skillRepo.save(skill);
  }

  async getOrCreate(skillId: number, skillName?: string): Promise<Skill> {
    const existing = await this.skillRepo.findOne({ where: { id: skillId } });
    if (existing) {
      if (skillName && !existing.name) {
        existing.name = skillName;
        await this.skillRepo.save(existing);
      }
      return existing;
    }

    const skill = this.skillRepo.create({ id: skillId, name: skillName });
    return this.skillRepo.save(skill);
  }

  async getOrCreateBatch(
    items: Array<{ skillId: number; name: string }>,
  ): Promise<Skill[]> {
    if (items.length === 0) return [];
    const ids = items.map((i) => i.skillId);
    const existing = await this.skillRepo.findBy(ids.map((id) => ({ id })));
    const existingMap = new Map(existing.map((s) => [s.id, s]));

    const toCreate: Skill[] = [];
    for (const item of items) {
      if (!existingMap.has(item.skillId)) {
        toCreate.push(
          this.skillRepo.create({ id: item.skillId, name: item.name }),
        );
      }
    }

    if (toCreate.length > 0) {
      const created = await this.skillRepo.save(toCreate);
      for (const s of created) existingMap.set(s.id, s);
    }

    return items.map((i) => existingMap.get(i.skillId)!);
  }

  private inferCategory(name: string): string | undefined {
    const patterns: Array<[RegExp, string]> = [
      [
        /\b(Python|Java|TypeScript|Go|Rust|C\+\+|PHP|Ruby|Swift|Kotlin)\b/i,
        '编程语言',
      ],
      [
        /\b(React|Vue|Angular|Django|Spring|Flask|Express|NestJS)\b/i,
        '框架/库',
      ],
      [
        /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Neo4j|Kafka)\b/i,
        '数据/存储',
      ],
      [/\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Terraform)\b/i, '云/DevOps'],
      [
        /\b(机器学习|深度学习|NLP|LLM|RAG|大模型|计算机视觉|推荐系统)\b/i,
        'AI/ML',
      ],
      [/零售|门店|销售|商品|库存|供应链/, '零售'],
      [/会计|财务|税务|审计|报表|核算/, '会计/财务'],
      [/医疗|临床|影像|护理|药品|诊断/, '医疗'],
      [/金融|投资|风控|信贷|基金|证券/, '金融'],
      [/教育|培训|课程|教学|教研/, '教育'],
      [/设计|UI|UX|交互|视觉|平面/, '设计'],
      [/法务|法律|合规|知识产权|合同/, '法务'],
      [/人力|招聘|薪酬|绩效|培训/, '人力资源'],
      [/市场|营销|品牌|推广|运营/, '市场/运营'],
    ];
    for (const [regex, cat] of patterns) {
      if (regex.test(name)) return cat;
    }
    return undefined;
  }
}
