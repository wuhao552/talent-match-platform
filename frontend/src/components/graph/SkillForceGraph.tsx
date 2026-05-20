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

export function SkillForceGraph({ skills, width = 600, height = 450 }: Props) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || skills.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const container = svg.append('g')
    const centerX = width / 2
    const centerY = height / 2

    // Build nodes: center + skills
    const nodes: SimNode[] = [
      { id: 'center', label: '能力核心', group: 0, proficiency: '', isCenter: true },
    ]
    const links: SimLink[] = []

    for (const s of skills) {
      const nodeId = `s-${s.skillId}`
      nodes.push({
        id: nodeId,
        label: s.skillName || `#${s.skillId}`,
        group: 1,
        proficiency: s.proficiency || 'intermediate',
        isCenter: false,
      })
      links.push({
        source: 'center',
        target: nodeId,
        value: (s.confidence || 0.7) * 3,
      })
    }

    // Proficiency → color
    const profColors: Record<string, string> = {
      beginner: '#94a3b8',
      intermediate: '#60a5fa',
      advanced: '#a78bfa',
      expert: '#f59e0b',
    }

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { container.attr('transform', event.transform.toString()) })
    svg.call(zoom)

    // Simulation
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(centerX, centerY))
      .force('collision', d3.forceCollide().radius(30))

    // Links
    const link = container.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', (d) => Math.min(d.value, 4))
      .attr('stroke-opacity', 0.6)

    // Nodes
    const node = container.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')

    node.call(
      d3.drag<SVGGElement, SimNode>()
        .on('start', (_event: any, d: any) => { if (!_event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (_event: any, d: any) => { d.fx = _event.x; d.fy = _event.y })
        .on('end', (_event: any, d: any) => { if (!_event.active) sim.alphaTarget(0); d.fx = null; d.fy = null }) as any,
    )

    node.append('circle')
      .attr('r', (d) => d.isCenter ? 22 : 14)
      .attr('fill', (d) => d.isCenter ? '#6366f1' : (profColors[d.proficiency] || '#60a5fa'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    node.append('text')
      .text((d) => d.label.length > 8 ? d.label.slice(0, 7) + '..' : d.label)
      .attr('dy', (d) => d.isCenter ? -28 : -20)
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => d.isCenter ? 12 : 10)
      .attr('fill', '#334155')
      .attr('font-weight', (d) => d.isCenter ? 'bold' : 'normal')

    // Tick
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
      <div className="flex h-[450px] items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-sm text-muted-foreground">暂无技能数据</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} />
    </div>
  )
}
