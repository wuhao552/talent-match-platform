/**
 * 预计算脚本：从共现 CSV 构建技能相似度矩阵、社区、向量
 *
 * 运行方式: npx tsx scripts/build-skill-graph.ts
 *
 * 输入: data/entity_map/graph_*.csv（从 benchmark-main parquet 转换而来）
 * 输出: data/entity_map/skill_similarity.json
 *       data/entity_map/skill_communities.json
 *       data/entity_map/skill_vectors.json
 */

import * as fs from 'fs'
import * as path from 'path'
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'

// ── 配置 ──────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../data/entity_map')
const GRAPH_DIR = DATA_DIR  // CSV 文件所在目录

const GRANULARITY_FILES: Array<{ file: string; label: string }> = [
  { file: 'graph_r0.csv', label: 'L1_OCCUPATION' },
  { file: 'graph_r1.csv', label: 'L2_OCCUPATION' },
  { file: 'graph_r2.csv', label: 'SKILL' },
  { file: 'graph_company.csv', label: 'COMPANY' },
  { file: 'graph_region.csv', label: 'REGION' },
]

const SIMILARITY_THRESHOLD = 0.1
const LOUVAIN_MIN_WEIGHT = 15  // 只在 composite ≥ 15 的边上跑社区检测

// ── 工具函数 ──────────────────────────────────────────────

function readCsv(filename: string): Array<{ row_id: number; col_id: number }> {
  const filepath = path.join(GRAPH_DIR, filename)
  const content = fs.readFileSync(filepath, 'utf-8')
  const lines = content.trim().split('\n')
  const header = lines[0].replace(/\r/g, '').split(',')
  const rowIdx = header.indexOf('row_id')
  const colIdx = header.indexOf('col_id')

  const rows: Array<{ row_id: number; col_id: number }> = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].replace(/\r/g, '').split(',')
    rows.push({
      row_id: parseInt(cols[rowIdx], 10),
      col_id: parseInt(cols[colIdx], 10),
    })
  }
  return rows
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  console.log('=== 技能图预计算 ===\n')

  // Step 1: 读取所有 CSV 并聚合为无向加权边
  console.log('[1/5] 读取 CSV 文件并聚合边...')

  // edgeKey -> { freq_L1, freq_L2, freq_SKILL, freq_CO, freq_RG }
  type EdgeFreqs = Record<string, number>
  const edgeMap = new Map<string, EdgeFreqs>()

  for (const { file, label } of GRANULARITY_FILES) {
    const rows = readCsv(file)
    console.log(`  ${file}: ${rows.length.toLocaleString()} 行`)

    const freqKey = `freq_${label}`
    for (const { row_id, col_id } of rows) {
      if (row_id === col_id) continue  // 跳过自环
      const a = Math.min(row_id, col_id)
      const b = Math.max(row_id, col_id)
      const key = `${a}-${b}`
      if (!edgeMap.has(key)) edgeMap.set(key, {})
      const freqs = edgeMap.get(key)!
      freqs[freqKey] = (freqs[freqKey] || 0) + 1
    }
  }

  console.log(`  去重后无向边数: ${edgeMap.size.toLocaleString()}`)

  // Step 2: 构建 graphology 图
  console.log('\n[2/5] 构建 graphology 图...')

  const allSkillIds = new Set<number>()
  const graph = new Graph({ type: 'undirected' })

  // 计算 composite weight 并添加边
  const edges: Array<{ a: number; b: number; weight: number; freqs: EdgeFreqs }> = []
  for (const [key, freqs] of edgeMap) {
    const [aStr, bStr] = key.split('-')
    const a = parseInt(aStr, 10)
    const b = parseInt(bStr, 10)
    // composite = freq_SKILL + freq_RG * 0.5 + freq_CO * 0.3 + freq_L2 * 0.2 + freq_L1 * 0.1
    const weight =
      (freqs.freq_SKILL || 0) +
      (freqs.freq_REGION || 0) * 0.5 +
      (freqs.freq_COMPANY || 0) * 0.3 +
      (freqs.freq_L2_OCCUPATION || 0) * 0.2 +
      (freqs.freq_L1_OCCUPATION || 0) * 0.1
    edges.push({ a, b, weight, freqs })
    allSkillIds.add(a)
    allSkillIds.add(b)
  }

  // 添加节点
  for (const id of allSkillIds) {
    graph.addNode(String(id))
  }
  // 添加边
  for (const { a, b, weight } of edges) {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`
    if (!graph.hasEdge(String(a), String(b))) {
      graph.addEdge(String(a), String(b), { weight })
    }
  }

  console.log(`  节点: ${graph.order}, 边: ${graph.size}`)

  // Step 3: Louvain 社区检测
  console.log('\n[3/5] Louvain 社区检测...')

  // 在高权重边上构建子图用于社区检测
  const communityGraph = new Graph({ type: 'undirected' })
  for (const node of graph.nodes()) {
    communityGraph.addNode(node)
  }
  let highWeightEdges = 0
  graph.forEachEdge((edge, attrs, source, target) => {
    if (attrs.weight >= LOUVAIN_MIN_WEIGHT) {
      communityGraph.addEdge(source, target, { weight: attrs.weight })
      highWeightEdges++
    }
  })
  console.log(`  高权重边 (≥${LOUVAIN_MIN_WEIGHT}): ${highWeightEdges}`)

  const communities: Record<string, number> = {}
  if (highWeightEdges > 0) {
    const result = louvain(communityGraph, { resolution: 1.0 })
    for (const [nodeId, communityId] of Object.entries(result)) {
      communities[nodeId] = communityId as number
    }
    const communityIds = new Set(Object.values(communities))
    console.log(`  检测到 ${communityIds.size} 个社区`)

    // 打印社区大小分布
    const sizes = new Map<number, number>()
    for (const cid of Object.values(communities)) {
      sizes.set(cid, (sizes.get(cid) || 0) + 1)
    }
    const sortedSizes = [...sizes.entries()].sort((a, b) => b[1] - a[1])
    console.log(`  最大社区: ${sortedSizes[0][1]} 个技能, 最小: ${sortedSizes[sortedSizes.length - 1][1]} 个技能`)
  }

  // Step 4: Jaccard 相似度矩阵
  console.log('\n[4/5] 计算 Jaccard 相似度...')

  // 构建每个节点的邻居权重 Map
  const neighborWeights = new Map<number, Map<number, number>>()
  for (const { a, b, weight } of edges) {
    if (!neighborWeights.has(a)) neighborWeights.set(a, new Map())
    if (!neighborWeights.has(b)) neighborWeights.set(b, new Map())
    neighborWeights.get(a)!.set(b, weight)
    neighborWeights.get(b)!.set(a, weight)
  }

  const similarityPairs: Array<{ a: number; b: number; sim: number }> = []
  const skillIds = [...allSkillIds].sort((x, y) => x - y)

  for (let i = 0; i < skillIds.length; i++) {
    const neighborsA = neighborWeights.get(skillIds[i])
    if (!neighborsA) continue
    for (let j = i + 1; j < skillIds.length; j++) {
      const neighborsB = neighborWeights.get(skillIds[j])
      if (!neighborsB) continue

      // 计算加权 Jaccard: Σmin(w) / Σmax(w) 遍历 A∪B 的所有邻居
      const allNeighbors = new Set([...neighborsA.keys(), ...neighborsB.keys()])
      let numerator = 0
      let denominator = 0
      for (const k of allNeighbors) {
        if (k === skillIds[i] || k === skillIds[j]) continue
        const wA = neighborsA.get(k) || 0
        const wB = neighborsB.get(k) || 0
        numerator += Math.min(wA, wB)
        denominator += Math.max(wA, wB)
      }
      if (denominator > 0) {
        const sim = numerator / denominator
        if (sim >= SIMILARITY_THRESHOLD) {
          similarityPairs.push({ a: skillIds[i], b: skillIds[j], sim: Math.round(sim * 1000) / 1000 })
        }
      }
    }
  }

  similarityPairs.sort((x, y) => y.sim - x.sim)
  console.log(`  相似度对 (≥${SIMILARITY_THRESHOLD}): ${similarityPairs.length.toLocaleString()}`)
  console.log(`  最高相似度: ${similarityPairs[0]?.sim}, 最低: ${similarityPairs[similarityPairs.length - 1]?.sim}`)

  // Step 5: 技能向量（基于共现邻居的权重向量）
  console.log('\n[5/5] 生成技能向量...')

  // 活跃技能 = 有共现边的技能
  const activeSkills = [...allSkillIds].sort((x, y) => x - y)
  const activeIndex = new Map<number, number>()
  activeSkills.forEach((id, i) => activeIndex.set(id, i))

  const vectors: Record<string, number[]> = {}
  for (const skillId of activeSkills) {
    const vec = new Array(activeSkills.length).fill(0)
    const neighbors = neighborWeights.get(skillId)
    if (neighbors) {
      for (const [neighborId, weight] of neighbors) {
        const idx = activeIndex.get(neighborId)
        if (idx !== undefined) {
          vec[idx] = weight
        }
      }
    }
    // L2 归一化
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    if (norm > 0) {
      for (let k = 0; k < vec.length; k++) vec[k] /= norm
    }
    vectors[String(skillId)] = vec
  }

  console.log(`  向量维度: ${activeSkills.length}, 生成 ${Object.keys(vectors).length} 个向量`)

  // ── 写入 JSON ──────────────────────────────────────────

  console.log('\n写入 JSON 文件...')

  // skill_similarity.json
  const simOutput = {
    version: 1,
    pairs: similarityPairs.map(p => [p.a, p.b, p.sim] as [number, number, number]),
  }
  const simPath = path.join(DATA_DIR, 'skill_similarity.json')
  fs.writeFileSync(simPath, JSON.stringify(simOutput))
  console.log(`  ${simPath} (${(fs.statSync(simPath).size / 1024).toFixed(0)} KB)`)

  // skill_communities.json
  const commOutput = {
    version: 1,
    communities: Object.fromEntries(
      Object.entries(communities).map(([k, v]) => [k, v])
    ),
  }
  const commPath = path.join(DATA_DIR, 'skill_communities.json')
  fs.writeFileSync(commPath, JSON.stringify(commOutput))
  console.log(`  ${commPath}`)

  // skill_vectors.json
  const vecOutput = {
    version: 1,
    dimension: activeSkills.length,
    activeSkills,
    vectors,
  }
  const vecPath = path.join(DATA_DIR, 'skill_vectors.json')
  fs.writeFileSync(vecPath, JSON.stringify(vecOutput))
  console.log(`  ${vecPath} (${(fs.statSync(vecPath).size / 1024).toFixed(0)} KB)`)

  console.log('\n完成!')
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
