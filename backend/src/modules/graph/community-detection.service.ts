import { Injectable } from '@nestjs/common'
import { Neo4jService } from './neo4j.service'

// ── Types ──

export interface ProgressEvent {
  phase: 'loading' | 'init' | 'iteration' | 'complete' | 'error'
  iteration?: number
  maxIterations?: number
  communityCount?: number
  totalNodes?: number
  totalEdges?: number
  description: string
}

export type ProgressCallback = (event: ProgressEvent) => void

interface AdjNode {
  id: number
  neighbors: number[]       // neighbor node indices
  weights: number[]         // edge weights (parallel to neighbors)
  degree: number            // sum of edge weights
  community: number         // current community index
}

// ── Service ──

@Injectable()
export class CommunityDetectionService {
  constructor(private neo4j: Neo4jService) {}

  /**
   * Run Leiden community detection with progress reporting.
   * Loads graph from Neo4j, runs the algorithm, returns skillId → communityId map.
   */
  async detectWithProgress(onProgress: ProgressCallback): Promise<Map<number, number>> {
    const t0 = Date.now()

    // ── Phase 1: Load edges from Neo4j ──
    onProgress({ phase: 'loading', description: '正在从 Neo4j 加载技能共现边...' })

    const edges = await this.loadEdges()
    if (edges.length === 0) {
      onProgress({ phase: 'error', description: 'Neo4j 中没有 CO_OCCURS_WITH 边数据' })
      return new Map()
    }

    // Build node index
    const nodeSet = new Set<number>()
    for (const e of edges) {
      nodeSet.add(e.source)
      nodeSet.add(e.target)
    }
    const nodeIds = [...nodeSet]
    const idToIdx = new Map<number, number>()
    nodeIds.forEach((id, i) => idToIdx.set(id, i))

    // Deduplicate edges (undirected): keep max weight per pair
    const edgeMap = new Map<string, number>()
    for (const e of edges) {
      const a = Math.min(e.source, e.target)
      const b = Math.max(e.source, e.target)
      const key = `${a}-${b}`
      const w = e.weight
      edgeMap.set(key, Math.max(edgeMap.get(key) ?? 0, w))
    }

    // Build adjacency
    const nodes: AdjNode[] = nodeIds.map((id) => ({
      id,
      neighbors: [],
      weights: [],
      degree: 0,
      community: -1,
    }))

    let totalEdgeWeight = 0
    for (const [key, w] of edgeMap) {
      const [aStr, bStr] = key.split('-')
      const ai = idToIdx.get(Number(aStr))!
      const bi = idToIdx.get(Number(bStr))!
      nodes[ai].neighbors.push(bi)
      nodes[ai].weights.push(w)
      nodes[bi].neighbors.push(ai)
      nodes[bi].weights.push(w)
      nodes[ai].degree += w
      nodes[bi].degree += w
      totalEdgeWeight += w
    }

    // Remove duplicates in adjacency (same neighbor may appear from both directions)
    for (const node of nodes) {
      const merged = new Map<number, number>()
      for (let i = 0; i < node.neighbors.length; i++) {
        const n = node.neighbors[i]
        merged.set(n, (merged.get(n) ?? 0) + node.weights[i])
      }
      node.neighbors = [...merged.keys()]
      node.weights = [...merged.values()]
    }

    onProgress({
      phase: 'init',
      totalNodes: nodes.length,
      totalEdges: edgeMap.size,
      description: `加载完成：${nodes.length} 个技能节点，${edgeMap.size} 条共现边`,
    })

    // ── Phase 2: Run Leiden ──
    const communities = this.leiden(nodes, totalEdgeWeight, onProgress)

    // ── Phase 3: Map back to skill IDs ──
    const result = new Map<number, number>()
    // Re-number communities to 0..N-1
    const commIds = [...new Set(communities)]
    const commRenumber = new Map<number, number>()
    commIds.forEach((c, i) => commRenumber.set(c, i))

    for (let i = 0; i < nodes.length; i++) {
      result.set(nodes[i].id, commRenumber.get(communities[i]) ?? 0)
    }

    const uniqueCommunities = commIds.length
    const elapsed = Date.now() - t0

    onProgress({
      phase: 'complete',
      communityCount: uniqueCommunities,
      totalNodes: nodes.length,
      totalEdges: edgeMap.size,
      description: `社区发现完成：${uniqueCommunities} 个社区，${nodes.length} 个节点，耗时 ${elapsed}ms`,
    })

    return result
  }

  /**
   * Load co-occurrence edges from Neo4j.
   * Uses freq_SKILL as edge weight.
   */
  private async loadEdges(): Promise<Array<{ source: number; target: number; weight: number }>> {
    // Fetch all CO_OCCURS_WITH edges with frequency data
    const result = await this.neo4j.run(
      `MATCH (a:Skill)-[r:CO_OCCURS_WITH]-(b:Skill)
       WHERE a.id < b.id
       RETURN a.id AS sourceId, b.id AS targetId,
              coalesce(r.freq_SKILL, 1) AS weight
       LIMIT 10000`,
    )

    return result.records.map((r) => ({
      source: this.toNum(r.get('sourceId')),
      target: this.toNum(r.get('targetId')),
      weight: Math.max(1, this.toNum(r.get('weight'))),
    }))
  }

  private toNum(val: unknown): number {
    if (val === null || val === undefined) return 0
    if (typeof val === 'number') return val
    if (typeof val === 'bigint') return Number(val)
    if (typeof (val as any)?.toNumber === 'function') return (val as any).toNumber()
    return Number(val) || 0
  }

  /**
   * Leiden algorithm for community detection.
   * Returns an array of community assignments (one per node, indexed same as nodes[]).
   */
  private leiden(
    nodes: AdjNode[],
    totalEdgeWeight: number,
    onProgress: ProgressCallback,
    resolution = 1.0,
    maxIterations = 10,
  ): number[] {
    const n = nodes.length
    if (n === 0) return []

    // Initialize: each node in its own community
    const community = Array.from({ length: n }, (_, i) => i)
    for (let i = 0; i < n; i++) nodes[i].community = i

    // Two-level partition: p (current) and p1 (refined)
    const p = [...community]   // current partition
    const p1 = [...community]  // refined partition

    let iter = 0
    let improved = true

    while (improved && iter < maxIterations) {
      iter++
      improved = false

      // ── Move phase ──
      // Randomize traversal order
      const order = this.shuffle(Array.from({ length: n }, (_, i) => i))
      let moved = false

      for (const vi of order) {
        const v = nodes[vi]
        const bestComm = this.findBestCommunity(nodes, vi, p, resolution, totalEdgeWeight)
        if (bestComm !== -1 && bestComm !== p[vi]) {
          // Move v to bestComm
          p[vi] = bestComm
          v.community = bestComm
          moved = true
        }
      }

      if (moved) improved = true

      // ── Refine phase ──
      // Local moving within each community to create well-connected subcommunities
      // p1 starts as a copy of the initial partition (each node alone)
      for (let i = 0; i < n; i++) p1[i] = i

      // Group nodes by community
      const commNodes = new Map<number, number[]>()
      for (let i = 0; i < n; i++) {
        const c = p[i]
        if (!commNodes.has(c)) commNodes.set(c, [])
        commNodes.get(c)!.push(i)
      }

      // For each community, do local refinement
      for (const [, members] of commNodes) {
        if (members.length <= 1) continue

        // Build sub-community structure for this community
        const subComm = new Map<number, number>() // nodeIdx → sub-community
        for (const mi of members) subComm.set(mi, mi)

        // Local moving within the community
        const shuffledMembers = this.shuffle([...members])
        for (const vi of shuffledMembers) {
          const v = nodes[vi]
          // Find best sub-community among neighbors in same community
          const neighborComms = new Map<number, number>() // subComm → sum weight
          for (let ni = 0; ni < v.neighbors.length; ni++) {
            const neighborIdx = v.neighbors[ni]
            if (p[neighborIdx] !== p[vi]) continue
            const sc = subComm.get(neighborIdx) ?? neighborIdx
            neighborComms.set(sc, (neighborComms.get(sc) ?? 0) + v.weights[ni])
          }

          let bestSub = subComm.get(vi) ?? vi
          let bestGain = 0
          const currentSub = subComm.get(vi) ?? vi

          for (const [sc, w] of neighborComms) {
            if (sc === currentSub) continue
            // Gain from moving to sc
            const gain = w * resolution
            if (gain > bestGain) {
              bestGain = gain
              bestSub = sc
            }
          }

          if (bestSub !== currentSub) {
            subComm.set(vi, bestSub)
          }
        }

        // Update p1 with refined sub-communities
        // Re-number sub-communities to avoid conflicts across communities
        const subCommRenumber = new Map<number, number>()
        let subIdx = 0
        for (const mi of members) {
          const sc = subComm.get(mi) ?? mi
          if (!subCommRenumber.has(sc)) {
            subCommRenumber.set(sc, subIdx++)
          }
          p1[mi] = subCommRenumber.get(sc)!
        }
      }

      // ── Aggregate phase ──
      // Re-number communities to be contiguous
      const commRenumber = new Map<number, number>()
      let newCommIdx = 0
      for (let i = 0; i < n; i++) {
        if (!commRenumber.has(p[i])) {
          commRenumber.set(p[i], newCommIdx++)
        }
        p[i] = commRenumber.get(p[i])!
        nodes[i].community = p[i]
      }

      const communityCount = newCommIdx

      onProgress({
        phase: 'iteration',
        iteration: iter,
        maxIterations,
        communityCount,
        totalNodes: n,
        description: `第 ${iter} 轮迭代完成，当前 ${communityCount} 个社区`,
      })

      // Check convergence: if community count didn't change significantly
      if (!moved) break
    }

    return p
  }

  /**
   * Find the best community for node vi that maximizes modularity gain.
   */
  private findBestCommunity(
    nodes: AdjNode[],
    vi: number,
    partition: number[],
    resolution: number,
    totalEdgeWeight: number,
  ): number {
    const v = nodes[vi]
    const currentComm = partition[vi]

    if (totalEdgeWeight === 0) return currentComm

    // Calculate Σ_tot and k_i,in for current community
    const commTotWeight = new Map<number, number>() // community → sum of degrees
    const commEdgeWeight = new Map<number, number>() // community → sum of edge weights to v

    for (let i = 0; i < v.neighbors.length; i++) {
      const ni = v.neighbors[i]
      const nc = partition[ni]
      commEdgeWeight.set(nc, (commEdgeWeight.get(nc) ?? 0) + v.weights[i])
    }

    // Pre-compute Σ_tot for each community
    for (let i = 0; i < nodes.length; i++) {
      const c = partition[i]
      commTotWeight.set(c, (commTotWeight.get(c) ?? 0) + nodes[i].degree)
    }

    const m2 = totalEdgeWeight * 2
    const ki = v.degree

    // Remove v from its current community for gain calculation
    const sigmaTotCurrent = (commTotWeight.get(currentComm) ?? 0) - ki
    const kiInCurrent = commEdgeWeight.get(currentComm) ?? 0

    let bestComm = currentComm
    let bestGain = 0 // gain = 0 means stay in current community

    for (const [c, kiIn] of commEdgeWeight) {
      if (c === currentComm) continue

      // Gain from moving to community c (relative to current)
      const sigmaTot_c = commTotWeight.get(c) ?? 0

      // ΔQ = [ki,in(c) - ki,in(current)] / m
      //     - resolution * ki * [Σtot(c) - Σtot(current)] / (2m²)
      // Simplified: the change in modularity when moving from current to c
      const deltaQ =
        ((kiIn - kiInCurrent) / totalEdgeWeight) -
        (resolution * ki * ((sigmaTot_c - sigmaTotCurrent) / m2))

      if (deltaQ > bestGain) {
        bestGain = deltaQ
        bestComm = c
      }
    }

    return bestComm
  }

  /** Fisher-Yates shuffle */
  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
}
