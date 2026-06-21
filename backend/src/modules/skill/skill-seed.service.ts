import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Skill } from './skill.entity';
import * as fs from 'fs';
import * as path from 'path';

interface HotnessEntry {
  avgDemand6m: number;
  avgDemandAll: number;
  maxDemand: number;
  totalDemand: number;
  demandTrend: number;
  hotness: number;
}

interface BreakTrendEntry {
  direction: string;
  avgLast6m: number;
  avgPrev6m: number;
}

@Injectable()
export class SkillSeedService implements OnModuleInit {
  private readonly entityMapDir = path.resolve(
    process.env.ENTITY_MAP_DIR || path.join(process.cwd(), 'data/entity_map'),
  );

  private readonly categoryPatterns: Array<{
    regex: RegExp;
    category: string;
  }> = [
    {
      regex:
        /\b(Python|Java(?:Script)?|TypeScript|Go|Rust|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Scala|R\b(?!ag)|Perl|MATLAB|Dart|Lua|Shell|Bash|PowerShell|SQL|HTML|CSS|Sass|Less)\b/i,
      category: '编程语言',
    },
    {
      regex:
        /\b(React|Vue|Angular|Svelte|Next\.js|Nuxt|Django|Flask|FastAPI|Spring|Express|NestJS|Laravel|Rails|PyTorch|TensorFlow|Keras|PaddlePaddle|飞桨|Scikit-learn|Pandas|NumPy|OpenCV|LangChain|LlamaIndex|Hugging\s*Face|Transformers|Docker|Kubernetes|k8s|Jenkins|GitLab|GitHub|Nginx|Apache|Tomcat|Node\.js|Deno|Bun|jQuery|Bootstrap|Tailwind|Ant\s*Design|Element\s*UI)\b/i,
      category: '框架/库',
    },
    {
      regex:
        /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Oracle|SQL\s*Server|SQLite|Cassandra|Neo4j|HBase|Hive|Spark|Flink|Kafka|RabbitMQ|HDFS|MinIO|S3|DynamoDB|BigQuery|Snowflake)\b/i,
      category: '数据/存储',
    },
    {
      regex:
        /\b(AWS|Azure|GCP|阿里云|腾讯云|华为云|Terraform|Ansible|Prometheus|Grafana|ELK|CI\/CD|DevOps|GitOps)\b/i,
      category: '云/DevOps',
    },
    {
      regex:
        /\b(机器学习|深度学习|强化学习|自然语言处理|计算机视觉|语音识别|推荐系统|大模型|LLM|RAG|NLP|CV|GAN|CNN|RNN|Transformer|Agent|多模态|Embedding|Fine-tuning|Prompt|AIGC|目标检测|图像分割|文本分类|情感分析|知识图谱)\b/i,
      category: 'AI/ML',
    },
    {
      regex:
        /\b(沟通|团队合作|领导力|项目管理|敏捷|Scrum|Kanban|文档|需求分析|架构设计|系统设计|设计模式|重构|TDD|代码审查|技术选型)\b/i,
      category: '方法/软技能',
    },
  ];

  constructor(@InjectRepository(Skill) private skillRepo: Repository<Skill>) {}

  async onModuleInit() {
    await this.seedSkills();
  }

  /** Infer a category from a skill name */
  inferCategory(name: string): string | null {
    for (const { regex, category } of this.categoryPatterns) {
      if (regex.test(name)) return category;
    }
    return null;
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

    // Detect ID mismatch: check if skill ID 0 exists in PG (0-indexed matching Neo4j)
    const skillZero = await this.skillRepo.findOne({ where: { id: 0 } });
    const totalExisting = await this.skillRepo.count();

    // Also check if hotness data was loaded (detect incomplete seed from path issues)
    const missingHotness = await this.skillRepo.count({
      where: { hotness: IsNull() },
    });
    const hasHotness = missingHotness === 0;

    if (totalExisting >= expectedCount && skillZero && hasHotness) {
      console.log(
        `[SkillSeed] ${totalExisting} skills already loaded with full metadata, skipping`,
      );
      return;
    }

    if (totalExisting > 0 && !hasHotness) {
      console.log(
        `[SkillSeed] Skills exist but missing hotness/trend data (likely path issue). Re-seeding...`,
      );
    }

    // Need to re-seed: either not enough skills, or using old 1-indexed IDs
    if (totalExisting > 0) {
      console.log(
        `[SkillSeed] ID mismatch or incomplete seed detected (existing=${totalExisting}, hasId0=${!!skillZero}). Re-seeding with CASCADE...`,
      );
      // Truncate with CASCADE to handle FK references from document_skills
      await this.skillRepo.query('TRUNCATE TABLE skills CASCADE');
    }

    console.log(
      `[SkillSeed] Loading ${expectedCount} skills (0-indexed, aligned with Neo4j)...`,
    );

    // Load hotness and trend data
    const hotnessMap = this.loadJsonFile<Record<string, HotnessEntry>>(
      path.join(this.entityMapDir, 'skill_hotness.json'),
    );
    if (hotnessMap) {
      console.log(
        `[SkillSeed] Loaded hotness data for ${Object.keys(hotnessMap).length} skills`,
      );
    } else {
      console.warn(
        `[SkillSeed] Hotness data not found at ${path.join(this.entityMapDir, 'skill_hotness.json')}`,
      );
    }
    const breakTrends = this.loadJsonFile<Record<string, BreakTrendEntry>>(
      path.join(this.entityMapDir, 'break_trends_r2.json'),
    );
    const lowFreqIds = this.loadJsonFile<number[]>(
      path.join(this.entityMapDir, 'low_frequency_index', 'r2.json'),
    );
    const lowFreqSet = new Set(lowFreqIds || []);

    let inserted = 0;
    const batch: Skill[] = [];

    for (let i = 0; i < lines.length; i++) {
      // 0-indexed IDs match Neo4j Skill nodes
      const id = i;
      const name = lines[i];
      const hotnessData = hotnessMap?.[String(id)];
      const breakData = breakTrends?.[String(id)];

      batch.push(
        this.skillRepo.create({
          id,
          name,
          category: this.inferCategory(name) || undefined,
          hotness: hotnessData?.hotness ?? null,
          demandTrend: hotnessData?.demandTrend ?? null,
          avgDemand6m: hotnessData?.avgDemand6m ?? null,
          hasStructuralBreak: breakData ? true : false,
          isLowFrequency: lowFreqSet.has(id),
          breakDirection: breakData?.direction ?? null,
        } as Skill),
      );

      if (batch.length >= 200 || i === lines.length - 1) {
        await this.skillRepo.save(batch);
        inserted += batch.length;
        batch.length = 0;
        console.log(`[SkillSeed] Inserted ${inserted}/${expectedCount}`);
      }
    }

    console.log(`[SkillSeed] Done: ${inserted} skills in PG (0-indexed)`);
  }

  private loadJsonFile<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) {
      console.warn(`[SkillSeed] File not found: ${filePath}`);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.warn(
        `[SkillSeed] Failed to parse ${filePath}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  getSkillList(): string[] {
    const skillPath = path.join(this.entityMapDir, 'skill.list');
    if (!fs.existsSync(skillPath)) return [];
    return fs
      .readFileSync(skillPath, 'utf-8')
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  getR1List(): string[] {
    const p = path.join(this.entityMapDir, 'r1.list');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  getR2List(): string[] {
    const p = path.join(this.entityMapDir, 'r2.list');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  getRegionList(): string[] {
    const p = path.join(this.entityMapDir, 'region.list');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }
}
