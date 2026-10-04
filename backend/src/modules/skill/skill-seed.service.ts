import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './skill.entity';
import * as fs from 'fs';
import * as path from 'path';
import { normalize, stripSuffixes, inferCategory } from './skill.utils';

@Injectable()
export class SkillSeedService implements OnModuleInit {
  private readonly entityMapDir = path.resolve(
    process.env.ENTITY_MAP_DIR || path.join(process.cwd(), 'data/entity_map'),
  );

  constructor(@InjectRepository(Skill) private skillRepo: Repository<Skill>) {}

  async onModuleInit() {
    await this.seedSkills();
  }

  async seedSkills() {
    const skillPath = path.join(this.entityMapDir, 'skill.list');
    if (!fs.existsSync(skillPath)) {
      console.warn(
        `[SkillSeed] Skill list not found at ${skillPath}, skipping seed`,
      );
      return;
    }

    const lines = fs
      .readFileSync(skillPath, 'utf-8')
      .split('\n')
      .slice(1) // skip header
      .map((l) => l.trim())
      .filter(Boolean);
    const expectedCount = lines.length;

    const existing = await this.skillRepo.find({ select: ['id'] });
    const existingIds = new Set(existing.map((s) => s.id));
    const missingCount = lines.filter((_, i) => !existingIds.has(i)).length;

    if (missingCount === 0) {
      console.log(
        `[SkillSeed] ${existingIds.size} skills already loaded, skipping`,
      );
      return;
    }

    // 只补插缺失 id 的技能,绝不 TRUNCATE——
    // 旧实现 TRUNCATE ... CASCADE 会连带清空 document_skills(用户的技能标注数据)
    console.log(
      `[SkillSeed] Incomplete seed detected (existing=${existingIds.size}, expected=${expectedCount}). Inserting ${missingCount} missing skills...`,
    );

    let inserted = 0;
    const batch: Skill[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (existingIds.has(i)) continue;
      const id = i;
      const name = lines[i];

      batch.push(
        this.skillRepo.create({
          id,
          name,
          coreName: stripSuffixes(normalize(name)),
          category: inferCategory(name) || undefined,
        }),
      );

      if (batch.length >= 200 || i === lines.length - 1) {
        await this.skillRepo.save(batch);
        inserted += batch.length;
        batch.length = 0;
        console.log(`[SkillSeed] Inserted ${inserted}/${missingCount}`);
      }
    }

    console.log(`[SkillSeed] Done: ${inserted} skills in PG`);
  }
}
