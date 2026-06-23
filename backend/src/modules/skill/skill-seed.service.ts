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

    const totalExisting = await this.skillRepo.count();

    if (totalExisting >= expectedCount) {
      console.log(
        `[SkillSeed] ${totalExisting} skills already loaded, skipping`,
      );
      return;
    }

    if (totalExisting > 0) {
      console.log(
        `[SkillSeed] Incomplete seed detected (existing=${totalExisting}, expected=${expectedCount}). Re-seeding with CASCADE...`,
      );
      await this.skillRepo.query('TRUNCATE TABLE skills CASCADE');
    }

    console.log(`[SkillSeed] Loading ${expectedCount} skills...`);

    let inserted = 0;
    const batch: Skill[] = [];

    for (let i = 0; i < lines.length; i++) {
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
        console.log(`[SkillSeed] Inserted ${inserted}/${expectedCount}`);
      }
    }

    console.log(`[SkillSeed] Done: ${inserted} skills in PG`);
  }
}
