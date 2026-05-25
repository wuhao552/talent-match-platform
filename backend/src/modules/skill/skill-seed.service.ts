import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Skill } from './skill.entity'
import { Neo4jService } from '../graph/neo4j.service'
import * as fs from 'fs'
import * as path from 'path'

@Injectable()
export class SkillSeedService implements OnModuleInit {
  private readonly entityMapDir = path.resolve(process.env.ENTITY_MAP_DIR || 'C:/Users/18967/Desktop/claude/entity_map/entity_map')

  constructor(
    @InjectRepository(Skill) private skillRepo: Repository<Skill>,
    private neo4j: Neo4jService,
  ) {}

  async onModuleInit() {
    await this.seedSkills()
  }

  async seedSkills() {
    const skillPath = path.join(this.entityMapDir, 'skill.list')
    if (!fs.existsSync(skillPath)) {
      console.warn(`Skill list not found at ${skillPath}, skipping seed`)
      return
    }

    const lines = fs.readFileSync(skillPath, 'utf-8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
    console.log(`[SkillSeed] Loading ${lines.length} skills from entity_map...`)

    const existing = await this.skillRepo.count()
    if (existing >= lines.length) {
      console.log(`[SkillSeed] ${existing} skills already loaded, skipping`)
      return
    }

    let inserted = 0
    const batch: Skill[] = []
    for (let i = 0; i < lines.length; i++) {
      const id = i + 1
      const exists = await this.skillRepo.findOne({ where: { id } })
      if (exists) continue

      batch.push(this.skillRepo.create({ id, name: lines[i] }))
      if (batch.length >= 200 || i === lines.length - 1) {
        await this.skillRepo.save(batch)
        inserted += batch.length
        batch.length = 0
        console.log(`[SkillSeed] Inserted ${inserted}/${lines.length}`)
      }
    }

    console.log(`[SkillSeed] Done: ${inserted} new skills in PG`)

    // Also seed Neo4j Skill nodes
    console.log('[SkillSeed] Seeding Neo4j skill nodes...')
    const session = this.neo4j.getSession()
    try {
      // Create indexes in batches via the driver
      for (let i = 0; i < lines.length; i += 200) {
        const batch = lines.slice(i, i + 200)
        const params: Record<string, unknown> = {}
        const creates = batch.map((name, j) => {
          const idx = i + j + 1
          const idKey = `id${j}`; const nameKey = `name${j}`
          params[idKey] = idx; params[nameKey] = name
          return `MERGE (:Skill {id: $${idKey}, name: $${nameKey}})`
        })
        await session.run(creates.join('\n'), params)
      }
      console.log('[SkillSeed] Neo4j skill nodes seeded')
    } finally {
      await session.close()
    }
  }

  getSkillList(): string[] {
    const skillPath = path.join(this.entityMapDir, 'skill.list')
    if (!fs.existsSync(skillPath)) return []
    return fs.readFileSync(skillPath, 'utf-8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  }

  getR1List(): string[] {
    const p = path.join(this.entityMapDir, 'r1.list')
    if (!fs.existsSync(p)) return []
    return fs.readFileSync(p, 'utf-8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  }

  getR2List(): string[] {
    const p = path.join(this.entityMapDir, 'r2.list')
    if (!fs.existsSync(p)) return []
    return fs.readFileSync(p, 'utf-8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  }

  getRegionList(): string[] {
    const p = path.join(this.entityMapDir, 'region.list')
    if (!fs.existsSync(p)) return []
    return fs.readFileSync(p, 'utf-8').split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  }
}
