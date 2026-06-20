import { Injectable, OnModuleInit } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

interface SimilarityData {
  version: number
  pairs: [number, number, number][]  // [skillA, skillB, similarity]
}

interface CommunityData {
  version: number
  communities: Record<string, number>
}

interface VectorData {
  version: number
  dimension: number
  activeSkills: number[]
  vectors: Record<string, number[]>
}

@Injectable()
export class SkillSimilarityService implements OnModuleInit {
  // 稀疏相似度矩阵：key = "min-max" → similarity
  private simMatrix = new Map<string, number>()
  // 社区：skillId → communityId
  private communities = new Map<number, number>()
  // 技能向量：skillId → Float64Array
  private vectors = new Map<number, Float64Array>()
  // 有向量的技能 ID 列表（固定顺序）
  private activeSkillIds: number[] = []

  private readonly dataDir = path.resolve(
    process.env.ENTITY_MAP_DIR ||
      path.join(process.cwd(), '../data/entity_map'),
  )

  async onModuleInit() {
    this.loadSimilarity()
    this.loadCommunities()
    this.loadVectors()
  }

  private loadSimilarity() {
    const filepath = path.join(this.dataDir, 'skill_similarity.json')
    if (!fs.existsSync(filepath)) {
      console.warn(`[SkillSimilarity] skill_similarity.json not found at ${filepath}`)
      return
    }
    const data: SimilarityData = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    for (const [a, b, sim] of data.pairs) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`
      this.simMatrix.set(key, sim)
    }
    console.log(`[SkillSimilarity] Loaded ${this.simMatrix.size.toLocaleString()} similarity pairs`)
  }

  private loadCommunities() {
    const filepath = path.join(this.dataDir, 'skill_communities.json')
    if (!fs.existsSync(filepath)) {
      console.warn(`[SkillSimilarity] skill_communities.json not found at ${filepath}`)
      return
    }
    const data: CommunityData = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    for (const [k, v] of Object.entries(data.communities)) {
      this.communities.set(Number(k), v)
    }
    const communityIds = new Set(this.communities.values())
    console.log(`[SkillSimilarity] Loaded ${this.communities.size} skill communities (${communityIds.size} distinct)`)
  }

  private loadVectors() {
    const filepath = path.join(this.dataDir, 'skill_vectors.json')
    if (!fs.existsSync(filepath)) {
      console.warn(`[SkillSimilarity] skill_vectors.json not found at ${filepath}`)
      return
    }
    const data: VectorData = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    this.activeSkillIds = data.activeSkills
    for (const [k, vec] of Object.entries(data.vectors)) {
      this.vectors.set(Number(k), new Float64Array(vec))
    }
    console.log(`[SkillSimilarity] Loaded ${this.vectors.size} skill vectors (dim=${data.dimension})`)
  }

  /** O(1) 相似度查表 */
  getSimilarity(a: number, b: number): number {
    if (a === b) return 1.0
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`
    return this.simMatrix.get(key) ?? 0
  }

  /** 检查两个技能是否在同一社区 */
  sameCommunity(a: number, b: number): boolean {
    const ca = this.communities.get(a)
    const cb = this.communities.get(b)
    return ca !== undefined && ca === cb
  }

  /** 获取技能的社区 ID，不存在返回 -1 */
  getCommunity(skillId: number): number {
    return this.communities.get(skillId) ?? -1
  }

  /** 文档技能列表 → 加权向量 */
  docVector(skillIds: number[], proficiencyMap?: Map<string, number>): Float64Array {
    const dim = this.activeSkillIds.length
    if (dim === 0) return new Float64Array(0)

    // 构建 skillId → activeIndex 的映射
    const activeIndex = new Map<number, number>()
    this.activeSkillIds.forEach((id, i) => activeIndex.set(id, i))

    const vec = new Float64Array(dim)
    for (const skillId of skillIds) {
      const skillVec = this.vectors.get(skillId)
      if (skillVec) {
        const weight = proficiencyMap?.get(String(skillId)) ?? 1.0
        for (let k = 0; k < dim; k++) {
          vec[k] += skillVec[k] * weight
        }
      }
    }

    // L2 归一化
    let norm = 0
    for (let k = 0; k < dim; k++) norm += vec[k] * vec[k]
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let k = 0; k < dim; k++) vec[k] /= norm
    }

    return vec
  }

  /** 检查技能是否有向量数据 */
  hasVector(skillId: number): boolean {
    return this.vectors.has(skillId)
  }

  /** 批量余弦相似度：queryVec vs 每个 targetVec */
  batchCosineSim(queryVec: Float64Array, targetVecs: Float64Array[]): number[] {
    const dim = queryVec.length
    if (dim === 0) return targetVecs.map(() => 0)

    return targetVecs.map((tv) => {
      if (tv.length !== dim) return 0
      let dot = 0
      for (let k = 0; k < dim; k++) dot += queryVec[k] * tv[k]
      return dot  // 已归一化，dot product = cosine similarity
    })
  }

  /** 是否有预计算数据 */
  get isLoaded(): boolean {
    return this.simMatrix.size > 0
  }

  /** 运行时更新社区数据（由社区发现算法调用） */
  updateCommunities(communities: Map<number, number>): void {
    this.communities = communities
    const communityIds = new Set(communities.values())
    console.log(`[SkillSimilarity] Updated communities: ${communities.size} skills → ${communityIds.size} communities (real-time Leiden)`)
  }

  /** 清除社区数据，回退到文件加载的版本 */
  clearCommunities(): void {
    this.communities.clear()
    this.loadCommunities()
    console.log(`[SkillSimilarity] Communities reset to file-loaded version`)
  }
}
