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
}
