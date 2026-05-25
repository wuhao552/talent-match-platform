import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { DocumentSkill } from '@/types'

interface Props {
  skills: DocumentSkill[]
  width?: number
  height?: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  group: number
  proficiency: string
  isCenter: boolean
}

interface SimLink {
  source: string
  target: string
  value: number
}

const profColors: Record<string, string> = {
  beginner: '#94a3b8',
  intermediate: '#60a5fa',
  advanced: '#8b5cf6',
  expert: '#f59e0b',
}

export function SkillForceGraph({ skills, width = 600, height = 420 }: Props) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || skills.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const container = svg.append('g')
    const cx = width / 2
    const cy = height / 2

    const nodes: SimNode[] = [
      { id: 'center', label: '能力核心', group: 0, proficiency: '', isCenter: true },
    ]
    const links: SimLink[] = []

    for (const s of skills) {
      const nodeId = `s-${s.skillId}`
      nodes.push({
        id: nodeId,
        label: s.skillName || `技能 ${s.skillId}`,
        group: 1,
        proficiency: s.proficiency || 'intermediate',
        isCenter: false,
      })
      links.push({ source: 'center', target: nodeId, value: (s.confidence || 0.7) * 3 })
    }

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(60).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(cx, cy).strength(0.3))
      .force('radial', d3.forceRadial((d) => (d as SimNode).isCenter ? 0 : Math.min(180, 30 + skills.length * 6), cx, cy).strength(0.4))
      .force('collision', d3.forceCollide().radius(22))

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 3])
        .on('zoom', (event) => { container.attr('transform', event.transform.toString()) }) as any,
    )

    // Links
    const link = container.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', (d) => Math.min(d.value, 3))
      .attr('stroke-opacity', 0.5)

    // Nodes
    const node = container.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (_e: any, d: any) => { if (!_e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (_e: any, d: any) => { d.fx = _e.x; d.fy = _e.y })
          .on('end', (_e: any, d: any) => { if (!_e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }) as any,
      )

    // Circles
    node.append('circle')
      .attr('r', (d) => d.isCenter ? 18 : 12)
      .attr('fill', (d) => d.isCenter ? '#6366f1' : (profColors[d.proficiency] || '#60a5fa'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2.5)
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))')

    // Labels
    node.append('text')
      .text((d) => d.label.length > 6 ? d.label.slice(0, 5) + '…' : d.label)
      .attr('dy', (d) => d.isCenter ? -24 : -18)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => d.isCenter ? 12 : 10)
      .attr('fill', '#374151')
      .attr('font-weight', (d) => d.isCenter ? '600' : '400')

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => { sim.stop() }
  }, [skills, width, height])

  if (skills.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">解析完成后将展示能力图谱</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} />
    </div>
  )
}
