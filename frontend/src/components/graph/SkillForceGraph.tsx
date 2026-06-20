import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { DocumentSkill } from '@/types'

interface GraphLayout {
  nodes: Array<{ id: string; x: number; y: number; label: string; proficiency: string; isCenter: boolean }>
  links: Array<{ source: string; target: string; matched: boolean }>
}

interface Props {
  skills: DocumentSkill[]
  jobSkills?: DocumentSkill[]
  matchedSkillIds?: number[]
  matchedPairs?: Array<{ resumeSkillId?: number; jobSkillId?: number }>
  coocEdges?: Array<{ sourceId: number; targetId: number; freqSkill: number }>
  precomputedLayout?: GraphLayout
  width?: number
  height?: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  group: 'me' | 'job' | 'skill'
  proficiency: string
  isCenter: boolean
  isJob: boolean
  radius: number
  matched: boolean
  category?: string
}

interface SimLink {
  source: string
  target: string
  matched: boolean
}

const profColors: Record<string, string> = {
  beginner: '#94a3b8',
  intermediate: '#60a5fa',
  advanced: '#8b5cf6',
  expert: '#f59e0b',
}

const profLabel: Record<string, string> = {
  beginner: '入门', intermediate: '熟悉', advanced: '熟练', expert: '精通',
}

const profRadius: Record<string, number> = {
  beginner: 7, intermediate: 9, advanced: 11, expert: 14,
}


export function SkillForceGraph({ skills, jobSkills, matchedSkillIds, matchedPairs, coocEdges, precomputedLayout, width = 760, height = 480 }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; prof: string; matched: boolean } | null>(null)
  const matched = new Set(matchedSkillIds || [])
  const fuzzyLinkedResumeIds = new Set<number>()
  const fuzzyLinkedJobIds = new Set<number>()
  if (matchedPairs) {
    for (const pair of matchedPairs) {
      if (pair.resumeSkillId && pair.jobSkillId && pair.resumeSkillId !== pair.jobSkillId) {
        fuzzyLinkedResumeIds.add(pair.resumeSkillId)
        fuzzyLinkedJobIds.add(pair.jobSkillId)
      }
    }
  }

  useEffect(() => {
    if (!ref.current || skills.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    try {
      const cx = width / 2
      const cy = height / 2
      const hasJob = jobSkills && jobSkills.length > 0
      const leftX = hasJob ? cx - 180 : cx
      const rightX = cx + 180

      // Build a lookup of pre-computed node positions
      const layoutMap = new Map<string, { x: number; y: number }>()
      if (precomputedLayout) {
        for (const n of precomputedLayout.nodes) {
          layoutMap.set(n.id, { x: n.x, y: n.y })
        }
      }
      const hasLayout = layoutMap.size > 0

      // Build graph nodes
      const nodes: SimNode[] = [
        {
          id: 'me', label: '我', group: 'me', proficiency: '', isCenter: true, isJob: false, radius: 22, matched: true,
          x: layoutMap.get('me')?.x ?? leftX, y: layoutMap.get('me')?.y ?? cy,
        },
      ]
      if (hasJob) {
        nodes.push({
          id: 'job', label: '岗位', group: 'job', proficiency: '', isCenter: true, isJob: true, radius: 22, matched: true,
          x: rightX, y: cy,
        })
      }
      const links: SimLink[] = []
      const skillIds = new Set(skills.map((s) => s.skillId))

      for (const s of skills) {
        const nodeId = `s-${s.skillId}`
        const isM = matched.has(s.skillId) || fuzzyLinkedResumeIds.has(s.skillId)
        const pos = layoutMap.get(nodeId)
        nodes.push({
          id: nodeId,
          label: s.skillName || `技能 ${s.skillId}`,
          group: 'skill', proficiency: s.proficiency || 'intermediate',
          isCenter: false, isJob: false,
          radius: profRadius[s.proficiency] || 9,
          matched: isM,
          x: pos?.x, y: pos?.y,
        })
        links.push({ source: 'me', target: nodeId, matched: isM })
        if (isM && jobSkills && jobSkills.length > 0) {
          links.push({ source: 'job', target: nodeId, matched: true })
        }
      }

      if (jobSkills) {
        for (const s of jobSkills) {
          if (skillIds.has(s.skillId)) continue
          const nodeId = `j-${s.skillId}`
          const isM = matched.has(s.skillId) || fuzzyLinkedJobIds.has(s.skillId)
          nodes.push({
            id: nodeId,
            label: s.skillName || `技能 ${s.skillId}`,
            group: 'skill', proficiency: s.proficiency || 'intermediate',
            isCenter: false, isJob: true,
            radius: profRadius[s.proficiency] || 9,
            matched: isM,
            category: s.category || s.skill?.category,
          })
          links.push({ source: 'job', target: nodeId, matched: true })
        }
      }

      // Cross-edges for fuzzy-matched pairs
      if (matchedPairs) {
        for (const pair of matchedPairs) {
          if (pair.resumeSkillId && pair.jobSkillId && pair.resumeSkillId !== pair.jobSkillId) {
            const resumeNodeId = `s-${pair.resumeSkillId}`
            const jobNodeId = skillIds.has(pair.jobSkillId) ? `s-${pair.jobSkillId}` : `j-${pair.jobSkillId}`
            const alreadyLinked = links.some(l =>
              (l.source === resumeNodeId && l.target === jobNodeId) ||
              (l.source === jobNodeId && l.target === resumeNodeId)
            )
            if (!alreadyLinked) {
              links.push({ source: resumeNodeId, target: jobNodeId, matched: true })
            }
          }
        }
      }

      // Co-occurrence edges from Neo4j knowledge graph
      const coocLinks: SimLink[] = []
      if (coocEdges && coocEdges.length > 0) {
        const nodeIds = new Set(nodes.map((n) => n.id))
        for (const e of coocEdges) {
          const srcId = `s-${e.sourceId}`
          const tgtId = `s-${e.targetId}`
          const srcNode = nodeIds.has(srcId) ? srcId : (nodeIds.has(`j-${e.sourceId}`) ? `j-${e.sourceId}` : null)
          const tgtNode = nodeIds.has(tgtId) ? tgtId : (nodeIds.has(`j-${e.targetId}`) ? `j-${e.targetId}` : null)
          if (srcNode && tgtNode && srcNode !== tgtNode) {
            coocLinks.push({ source: srcNode, target: tgtNode, matched: false })
          }
        }
      }

      // Combine all links
      const allLinks = [...links, ...coocLinks]
      const nodeColor = (d: SimNode) => {
        if (d.isCenter) return d.group === 'me' ? '#6366f1' : '#10b981'
        return profColors[d.proficiency] || '#60a5fa'
      }

      // Create d3-force simulation
      const sim = d3.forceSimulation<SimNode>(nodes)
        .force('link', d3.forceLink<SimNode, SimLink>(allLinks).id((d) => d.id).distance(70).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-250))
        .force('collision', d3.forceCollide<SimNode>().radius((d) => d.radius + 10))
        .force('x', d3.forceX((d: any) => {
          if (d.isCenter) return d.group === 'me' ? leftX : rightX
          if (d.matched) return cx
          return d.isJob ? rightX : leftX
        }).strength(0.15))
        .force('y', d3.forceY(cy).strength(0.05))

      nodes[0].fx = leftX; nodes[0].fy = cy
      if (hasJob) {
        nodes[1].fx = rightX; nodes[1].fy = cy
      }

      // If pre-computed layout exists, skip simulation animation
      // by running one tick manually then stopping
      if (hasLayout) {
        sim.alpha(0).stop()
      }

      const container = svg.append('g')

      svg.call(d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => { container.attr('transform', event.transform.toString()) }) as any)

      // Defs
      const defs = container.append('defs')
      defs.append('radialGradient').attr('id', 'meGrad')
        .selectAll('stop').data([{ o: '0%', c: '#818cf8' }, { o: '100%', c: '#4f46e5' }])
        .join('stop').attr('offset', (d) => d.o).attr('stop-color', (d) => d.c)
      defs.append('radialGradient').attr('id', 'jobGrad')
        .selectAll('stop').data([{ o: '0%', c: '#34d399' }, { o: '100%', c: '#059669' }])
        .join('stop').attr('offset', (d) => d.o).attr('stop-color', (d) => d.c)

      // Links
      container.append('g').selectAll('line').data(allLinks).join('line')
        .attr('stroke', (d) => d.matched ? '#a7f3d0' : '#e5e7eb')
        .attr('stroke-width', (d) => d.matched ? 2.5 : 1.5)
        .attr('stroke-opacity', 0.8)

      // Nodes
      const node = container.append('g').selectAll('g').data(nodes).join('g')
        .attr('cursor', 'pointer')
        .on('mouseenter', function (event, d) {
          if (d.isCenter) return
          d3.select(this).select('circle').transition().duration(200).attr('r', d.radius * 1.3)
          setTooltip({ x: event.offsetX, y: event.offsetY, label: d.label, prof: d.proficiency, matched: d.matched })
        })
        .on('mouseleave', function (_event, d) {
          if (d.isCenter) return
          d3.select(this).select('circle').transition().duration(200).attr('r', d.radius)
          setTooltip(null)
        })
        .call(d3.drag<SVGGElement, SimNode>()
          .on('start', (e: any, d: any) => {
            if (d.isCenter) return
            if (!e.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (e: any, d: any) => { if (d.isCenter) return; d.fx = e.x; d.fy = e.y })
          .on('end', (e: any, d: any) => { if (d.isCenter) return; if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }) as any)

      // Circles
      node.append('circle')
        .attr('r', (d) => d.radius)
        .attr('fill', (d) => {
          if (d.isCenter) return d.group === 'me' ? 'url(#meGrad)' : 'url(#jobGrad)'
          return nodeColor(d)
        })
        .attr('stroke', (d) => d.matched && !d.isCenter ? '#10b981' : '#fff')
        .attr('stroke-width', (d) => d.isCenter ? 3 : (d.matched ? 2.5 : 2))
        .style('filter', (d) => {
          if (d.isCenter) return d.group === 'me' ? 'drop-shadow(0 2px 8px rgba(99,102,241,0.4))' : 'drop-shadow(0 2px 8px rgba(16,185,129,0.4))'
          return d.matched ? 'drop-shadow(0 1px 4px rgba(16,185,129,0.3))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
        })

      // Labels
      node.append('text')
        .text((d) => d.label)
        .attr('dy', (d) => d.isCenter ? -30 : d.radius + 13)
        .attr('text-anchor', 'middle')
        .attr('font-size', (d) => d.isCenter ? 13 : 11)
        .attr('fill', (d) => d.isCenter ? (d.group === 'me' ? '#4338ca' : '#047857') : '#374151')
        .attr('font-weight', (d) => d.isCenter ? 700 : 400)
        .attr('font-family', 'system-ui, sans-serif')
        .style('pointer-events', 'none')

      // Tick handler
      const tick = () => {
        container.selectAll<SVGLineElement, SimLink>('line')
          .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
        node.attr('transform', (d) => `translate(${d.x},${d.y})`)
      }
      sim.on('tick', tick)

      // With pre-computed layout: run one tick manually to resolve link
      // references and render immediately, then stop.
      if (hasLayout) {
        sim.tick()
        tick()
        sim.stop()
      }

      return () => { sim.stop() }
    } catch (err) {
      console.error('[SkillForceGraph] D3 initialization failed:', err)
    }
  }, [skills, jobSkills, matchedSkillIds, matchedPairs, coocEdges, precomputedLayout, width, height])

  if (skills.length === 0) {
    return <div className="flex h-[480px] items-center justify-center rounded-xl border bg-muted/10"><p className="text-sm text-muted-foreground">暂无技能数据</p></div>
  }

  const hasJob = jobSkills && jobSkills.length > 0
  const matchCount = matchedSkillIds?.length || 0

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#6366f1' }} />我 ({skills.length})
          </span>
          {hasJob && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#10b981' }} />岗位 ({jobSkills!.length})
            </span>
          )}
          {matchCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#059669' }} />匹配 ({matchCount})
            </span>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-white">
        <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} />
        {tooltip && (
          <div className="pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-sm shadow-md" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
            <p className="font-medium">{tooltip.label}</p>
            <p className="text-xs text-muted-foreground">
              {profLabel[tooltip.prof] || tooltip.prof}
              {tooltip.matched && <span className="ml-1.5 text-green-600 font-medium">· 已匹配</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
