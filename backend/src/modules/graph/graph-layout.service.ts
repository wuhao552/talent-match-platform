import { Injectable } from '@nestjs/common';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
  label: string;
  proficiency: string;
  isCenter: boolean;
  radius: number;
}

export interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  matched: boolean;
}

export interface GraphLayoutResult {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    label: string;
    proficiency: string;
    isCenter: boolean;
  }>;
  links: Array<{ source: string; target: string; matched: boolean }>;
}

const profRadius: Record<string, number> = {
  beginner: 7,
  intermediate: 9,
  advanced: 11,
  expert: 14,
};

@Injectable()
export class GraphLayoutService {
  computeLayout(
    skills: Array<{ skillId: number; proficiency: string; name: string }>,
    coocEdges: Array<{ sourceId: number; targetId: number }>,
    width = 760,
    height = 480,
  ): GraphLayoutResult {
    if (skills.length === 0) {
      return { nodes: [], links: [] };
    }

    const cx = width / 2;
    const cy = height / 2;
    const leftX = cx;

    // Build nodes: center "me" + skill nodes
    const nodes: LayoutNode[] = [
      {
        id: 'me',
        label: '我',
        proficiency: '',
        isCenter: true,
        radius: 22,
        x: leftX,
        y: cy,
      },
    ];

    const skillIdSet = new Set(skills.map((s) => s.skillId));

    for (const s of skills) {
      nodes.push({
        id: `s-${s.skillId}`,
        label: s.name || `技能 ${s.skillId}`,
        proficiency: s.proficiency || 'intermediate',
        isCenter: false,
        radius: profRadius[s.proficiency] || 9,
      });
    }

    // Build links: center → each skill
    const links: LayoutLink[] = [];
    for (const s of skills) {
      links.push({ source: 'me', target: `s-${s.skillId}`, matched: false });
    }

    // Add co-occurrence edges between skill nodes
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const e of coocEdges) {
      const srcId = `s-${e.sourceId}`;
      const tgtId = `s-${e.targetId}`;
      if (nodeIds.has(srcId) && nodeIds.has(tgtId) && srcId !== tgtId) {
        const alreadyExists = links.some(
          (l) =>
            (this.getNodeId(l.source) === srcId &&
              this.getNodeId(l.target) === tgtId) ||
            (this.getNodeId(l.source) === tgtId &&
              this.getNodeId(l.target) === srcId),
        );
        if (!alreadyExists) {
          links.push({ source: srcId, target: tgtId, matched: false });
        }
      }
    }

    // Run d3-force simulation to completion
    const sim = forceSimulation<LayoutNode>(nodes)
      .force(
        'link',
        forceLink<LayoutNode, LayoutLink>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.3),
      )
      .force('charge', forceManyBody().strength(-250))
      .force(
        'collision',
        forceCollide<LayoutNode>().radius((d) => d.radius + 10),
      )
      .force(
        'x',
        forceX<LayoutNode>((d) => (d.isCenter ? leftX : cx)).strength(0.15),
      )
      .force('y', forceY(cy).strength(0.05))
      .stop();

    // Fix center node position
    nodes[0].fx = leftX;
    nodes[0].fy = cy;

    // Run simulation ticks until stable
    sim.alpha(1);
    for (let i = 0; i < 300 && sim.alpha() > 0.01; i++) {
      sim.tick();
    }

    // Extract final positions
    const resultNodes = nodes.map((n) => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      label: n.label,
      proficiency: n.proficiency,
      isCenter: n.isCenter,
    }));

    const resultLinks = links.map((l) => ({
      source: this.getNodeId(l.source),
      target: this.getNodeId(l.target),
      matched: l.matched,
    }));

    return { nodes: resultNodes, links: resultLinks };
  }

  private getNodeId(ref: string | number | LayoutNode): string {
    return typeof ref === 'string'
      ? ref
      : typeof ref === 'number'
        ? String(ref)
        : ref.id;
  }
}
