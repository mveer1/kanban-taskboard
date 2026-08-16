import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import type { Board, Story } from '@/types/board';
import { LINK_BY_TYPE, LINK_TYPES } from '@/config/links';
import { findProject } from '@/store/selectors';
import { useUi } from '@/store/UiContext';
import './DependencyGraph.css';

/**
 * Force-directed story dependency graph.
 *
 * Nodes are stories, colored by project and sized by estimate. Edges are the
 * relationships from src/config/links.ts, colored per type. Drag to reposition,
 * click a node to jump to that story on the board.
 *
 * D3 owns the SVG contents; React only owns the container element.
 */

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  status: Story['status'];
  color: string;
  radius: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  type: string;
  color: string;
  dashed: boolean;
}

export function DependencyGraph({ board, stories }: { board: Board; stories: Story[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomApi = useRef<{
    zoomBy: (k: number) => void;
    fit: () => void;
  } | null>(null);
  const ui = useUi();

  /** All stories become nodes; edges come from their links. */
  const graph = useMemo(() => {
    const visible = new Set(stories.map((s) => s.id));
    const edges: GraphEdge[] = [];
    const connected = new Set<string>();

    for (const s of stories) {
      for (const l of s.links ?? []) {
        if (!visible.has(l.target)) continue;
        const def = LINK_BY_TYPE[l.type];
        edges.push({
          source: s.id,
          target: l.target,
          type: l.type,
          color: def?.color ?? '#6b7280',
          dashed: !def?.blocking,
        });
        connected.add(s.id);
        connected.add(l.target);
      }
    }

    const nodes: GraphNode[] = stories
      .map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        color: findProject(board, s.project)?.color ?? '#6b7280',
        radius: 16 + Math.min(20, Math.sqrt(s.estimate ?? 1) * 4),
      }));

    return { nodes, edges };
  }, [board, stories]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || graph.nodes.length === 0) return;

    const width = host.clientWidth || 700;
    const height = host.clientHeight || 480;

    // Clone so the simulation's mutations don't touch memoized data.
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const edges = graph.edges.map((e) => ({ ...e }));

    const svg = d3
      .select(host)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Zoom & pan: wrap all content in a <g> that receives the transform.
    const container = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });
    svg.call(zoom);

    /* Arrowheads, one per link color. */
    const defs = svg.append('defs');
    for (const def of LINK_TYPES) {
      defs
        .append('marker')
        .attr('id', `arrow-${def.type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 32)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', def.color);
    }

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(190)
          .strength(0.6),
      )
      .force('charge', d3.forceManyBody().strength(-1100))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((d) => d.radius + 34),
      );

    const link = container
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.7)
      .attr('stroke-dasharray', (d) => (d.dashed ? '6 4' : null))
      .attr('marker-end', (d) => `url(#arrow-${d.type})`);

    const node = container
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => ui.openDetail(d.id));

    node
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => (d.status === 'done' ? 'transparent' : d.color))
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => (d.status === 'done' ? 3 : 0));

    node
      .append('text')
      .text((d) => d.id)
      .attr('y', (d) => -d.radius - 9)
      .attr('text-anchor', 'middle')
      .attr('class', 'graph-id');

    node
      .append('text')
      .text((d) => (d.title.length > 28 ? `${d.title.slice(0, 28)}…` : d.title))
      .attr('y', (d) => d.radius + 20)
      .attr('text-anchor', 'middle')
      .attr('class', 'graph-title');

    node.append('title').text((d) => `${d.id} · ${d.title}`);

    node.call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Fit all nodes into view with padding.
    const fit = (duration = 400) => {
      const pad = 56;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        minX = Math.min(minX, n.x - n.radius);
        minY = Math.min(minY, n.y - n.radius);
        maxX = Math.max(maxX, n.x + n.radius);
        maxY = Math.max(maxY, n.y + n.radius);
      }
      if (!Number.isFinite(minX)) return;
      const bw = maxX - minX + pad * 2;
      const bh = maxY - minY + pad * 2;
      const scale = Math.min(width / bw, height / bh, 1.6);
      const tx = (width - bw * scale) / 2 - (minX - pad) * scale;
      const ty = (height - bh * scale) / 2 - (minY - pad) * scale;
      svg.transition().duration(duration).call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
    };

    simulation.on('end', () => fit());

    // Expose zoom controls to the React buttons.
    zoomApi.current = {
      zoomBy: (k) => svg.transition().duration(200).call(zoom.scaleBy, k),
      fit: () => fit(300),
    };

    return () => {
      zoomApi.current = null;
      simulation.stop();
      d3.select(host).selectAll('*').remove();
    };
  }, [graph, ui]);

  if (graph.nodes.length === 0) {
    return (
      <div className="empty">
        No stories on the board yet.
      </div>
    );
  }

  return (
    <div className="graph-wrap">
      <div className="graph-stage">
        <div className="graph-host" ref={hostRef} />
        <div className="graph-controls">
          <button
            type="button"
            className="graph-ctrl"
            title="Zoom in"
            onClick={() => zoomApi.current?.zoomBy(1.4)}
          >
            +
          </button>
          <button
            type="button"
            className="graph-ctrl"
            title="Zoom out"
            onClick={() => zoomApi.current?.zoomBy(1 / 1.4)}
          >
            −
          </button>
          <button
            type="button"
            className="graph-ctrl"
            title="Fit all nodes to view"
            onClick={() => zoomApi.current?.fit()}
          >
            ⤢
          </button>
        </div>
      </div>
      <div className="graph-legend">
        {LINK_TYPES.map((l) => (
          <span className="graph-legend-item" key={l.type}>
            <span
              className="graph-legend-line"
              style={{
                background: l.blocking ? l.color : 'transparent',
                borderTop: l.blocking ? 'none' : `1.5px dashed ${l.color}`,
              }}
            />
            {l.label}
          </span>
        ))}
        <span className="graph-legend-hint">
          Node size = estimate · hollow = done · scroll or drag canvas to browse · click a node to open it
        </span>
      </div>
    </div>
  );
}
