import dagre from '@dagrejs/dagre';
import { FlowNode, FlowEdge, LayoutOptions } from '@/types/flow';
import { calculateNodeDimensions } from './flow-utils';

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'TB',
  nodeSpacing: 100, // Horizontal spacing between nodes in the same rank
  rankSpacing: 150, // Vertical spacing between ranks
};

// Spacing between different connected components
const COMPONENT_SPACING_X = 120;
const COMPONENT_SPACING_Y = 80;

// Grid layout settings for isolated nodes
const GRID_COLUMNS = 4;
const GRID_CELL_WIDTH = 300;

/**
 * Find connected components in the graph using Union-Find algorithm
 */
function findConnectedComponents(
  nodes: FlowNode[],
  edges: FlowEdge[],
): FlowNode[][] {
  if (nodes.length === 0) return [];

  // Build adjacency info using Union-Find
  const parent: Map<string, string> = new Map();
  const rank: Map<string, number> = new Map();

  // Initialize each node as its own parent
  nodes.forEach((node) => {
    parent.set(node.id, node.id);
    rank.set(node.id, 0);
  });

  // Find with path compression
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  // Union by rank
  function union(x: string, y: string): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;

    const rankX = rank.get(rootX)!;
    const rankY = rank.get(rootY)!;

    if (rankX < rankY) {
      parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rankX + 1);
    }
  }

  // Union all connected nodes via edges
  edges.forEach((edge) => {
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target);
    }
  });

  // Group nodes by their root
  const componentMap: Map<string, FlowNode[]> = new Map();
  nodes.forEach((node) => {
    const root = find(node.id);
    if (!componentMap.has(root)) {
      componentMap.set(root, []);
    }
    componentMap.get(root)!.push(node);
  });

  // Convert to array and sort by size (largest first)
  const components = Array.from(componentMap.values());
  components.sort((a, b) => b.length - a.length);

  return components;
}

/**
 * Get edges that belong to a specific set of nodes
 */
function getComponentEdges(
  nodeIds: Set<string>,
  edges: FlowEdge[],
): FlowEdge[] {
  return edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
}

/**
 * Calculate the bounding box of a set of nodes
 */
function getBoundingBox(nodes: FlowNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const dimensions = calculateNodeDimensions({
      title: node.data.title || node.id,
      columns: node.data.columns || [],
      is_view: node.data.is_view || false,
    });

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + dimensions.width);
    maxY = Math.max(maxY, node.position.y + dimensions.height);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Apply dagre layout to a single connected component
 */
function layoutComponent(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: LayoutOptions,
): FlowNode[] {
  if (nodes.length === 0) return [];

  // For single-node components, just return with position at origin
  if (nodes.length === 1) {
    return [
      {
        ...nodes[0],
        position: { x: 0, y: 0 },
      },
    ];
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: options.direction,
    nodesep: options.nodeSpacing,
    ranksep: options.rankSpacing,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes
  nodes.forEach((node) => {
    const dimensions = calculateNodeDimensions({
      title: node.data.title || node.id,
      columns: node.data.columns || [],
      is_view: node.data.is_view || false,
    });

    dagreGraph.setNode(node.id, {
      width: dimensions.width,
      height: dimensions.height,
    });
  });

  // Add edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply positions
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });
}

/**
 * Layout isolated nodes in a grid pattern with dynamic row heights
 */
function layoutIsolatedNodesGrid(nodes: FlowNode[]): FlowNode[] {
  if (nodes.length === 0) return [];

  // Sort by table name for consistent ordering
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));

  // Calculate actual dimensions for each node
  const nodeDimensions = sortedNodes.map((node) => ({
    node,
    dimensions: calculateNodeDimensions({
      title: node.data.title || node.id,
      columns: node.data.columns || [],
      is_view: node.data.is_view || false,
    }),
  }));

  // Build rows with dynamic heights
  const rows: (typeof nodeDimensions)[] = [];
  for (let i = 0; i < nodeDimensions.length; i += GRID_COLUMNS) {
    rows.push(nodeDimensions.slice(i, i + GRID_COLUMNS));
  }

  // Calculate cumulative Y positions based on actual row heights
  const rowYPositions: number[] = [];
  let currentY = 0;
  rows.forEach((row) => {
    rowYPositions.push(currentY);
    const maxHeight = Math.max(...row.map((n) => n.dimensions.height));
    currentY += maxHeight + 50; // 50px gap between rows
  });

  // Position each node
  return nodeDimensions.map((item, index) => {
    const rowIndex = Math.floor(index / GRID_COLUMNS);
    const colIndex = index % GRID_COLUMNS;

    return {
      ...item.node,
      position: {
        x: colIndex * GRID_CELL_WIDTH,
        y: rowYPositions[rowIndex],
      },
    };
  });
}

/**
 * Normalize component positions to start from origin (0, 0)
 */
function normalizeToOrigin(nodes: FlowNode[]): FlowNode[] {
  if (nodes.length === 0) return [];

  const bbox = getBoundingBox(nodes);

  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x - bbox.minX,
      y: node.position.y - bbox.minY,
    },
  }));
}

/**
 * Offset all nodes by a given amount
 */
function offsetNodes(
  nodes: FlowNode[],
  offsetX: number,
  offsetY: number,
): FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}

/**
 * Smart layout algorithm that handles connected components
 * - Groups connected tables together using dagre
 * - Arranges isolated nodes in a grid
 * - Places all groups in a flowing layout pattern
 */
export function getLayoutedNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: Partial<LayoutOptions> = {},
): FlowNode[] {
  if (nodes.length === 0) return [];

  const layoutOptions = { ...DEFAULT_OPTIONS, ...options };

  // Find connected components
  const components = findConnectedComponents(nodes, edges);

  // Separate connected components from isolated nodes
  const connectedComponents: FlowNode[][] = [];
  const isolatedNodes: FlowNode[] = [];

  components.forEach((component) => {
    const nodeIds = new Set(component.map((n) => n.id));
    const componentEdges = getComponentEdges(nodeIds, edges);

    if (componentEdges.length > 0) {
      // This is a real connected component (has edges)
      connectedComponents.push(component);
    } else if (component.length > 1) {
      // Multiple nodes but no edges connecting them - treat as connected
      // (this shouldn't happen with proper Union-Find, but just in case)
      connectedComponents.push(component);
    } else {
      // Single isolated node
      isolatedNodes.push(...component);
    }
  });

  // Layout each connected component with dagre
  const layoutedComponents: FlowNode[][] = connectedComponents.map(
    (component) => {
      const nodeIds = new Set(component.map((n) => n.id));
      const componentEdges = getComponentEdges(nodeIds, edges);
      const layouted = layoutComponent(
        component,
        componentEdges,
        layoutOptions,
      );
      return normalizeToOrigin(layouted);
    },
  );

  // Layout isolated nodes in a grid
  const layoutedIsolated = layoutIsolatedNodesGrid(isolatedNodes);

  // Now arrange all the groups in a flowing pattern
  const allNodes: FlowNode[] = [];
  let currentX = 0;
  let currentY = 0;
  let rowMaxHeight = 0;
  const maxRowWidth = 1800; // Max width before wrapping to next row

  // Place connected components first (they're larger and more important)
  layoutedComponents.forEach((component) => {
    const bbox = getBoundingBox(component);

    // Check if we need to wrap to next row
    if (currentX > 0 && currentX + bbox.width > maxRowWidth) {
      currentX = 0;
      currentY += rowMaxHeight + COMPONENT_SPACING_Y;
      rowMaxHeight = 0;
    }

    const offsettedComponent = offsetNodes(component, currentX, currentY);
    allNodes.push(...offsettedComponent);

    currentX += bbox.width + COMPONENT_SPACING_X;
    rowMaxHeight = Math.max(rowMaxHeight, bbox.height);
  });

  // Place isolated nodes after connected components
  if (layoutedIsolated.length > 0) {
    const isolatedBbox = getBoundingBox(layoutedIsolated);

    // Check if we need to wrap
    if (currentX > 0 && currentX + isolatedBbox.width > maxRowWidth) {
      currentX = 0;
      currentY += rowMaxHeight + COMPONENT_SPACING_Y;
    }

    const offsettedIsolated = offsetNodes(layoutedIsolated, currentX, currentY);
    allNodes.push(...offsettedIsolated);
  }

  return allNodes;
}

/**
 * Calculate bounds of all nodes
 */
export function getNodesBounds(nodes: FlowNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const dimensions = calculateNodeDimensions({
      title: node.data.title,
      columns: node.data.columns,
      is_view: node.data.is_view,
    });

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + dimensions.width);
    maxY = Math.max(maxY, node.position.y + dimensions.height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Center nodes in viewport
 */
export function centerNodes(
  nodes: FlowNode[],
  viewportWidth: number,
  viewportHeight: number,
): FlowNode[] {
  const bounds = getNodesBounds(nodes);
  const offsetX = (viewportWidth - bounds.width) / 2 - bounds.x;
  const offsetY = (viewportHeight - bounds.height) / 2 - bounds.y;

  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}

/**
 * Apply layout with schema grouping
 * Groups nodes by schema and lays out each group separately
 * Only groups nodes that have an explicit schema defined
 */
export function getLayoutedNodesWithSchemas(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: Partial<LayoutOptions> = {},
): FlowNode[] {
  const layoutOptions = { ...DEFAULT_OPTIONS, ...options };

  // Separate nodes with schemas from nodes without schemas
  const schemaGroups: Record<string, FlowNode[]> = {};
  const noSchemaNodes: FlowNode[] = [];

  nodes.forEach((node) => {
    const schema = (node.data as any).schema;
    if (schema) {
      if (!schemaGroups[schema]) {
        schemaGroups[schema] = [];
      }
      schemaGroups[schema].push(node);
    } else {
      noSchemaNodes.push(node);
    }
  });

  // If there are no schemas, use the smart connected-component layout
  if (Object.keys(schemaGroups).length === 0) {
    return getLayoutedNodes(nodes, edges, layoutOptions);
  }

  // Layout nodes without schemas using smart layout
  let noSchemaLayouted: FlowNode[] = [];
  if (noSchemaNodes.length > 0) {
    const noSchemaNodeIds = new Set(noSchemaNodes.map((n) => n.id));
    const noSchemaEdges = edges.filter(
      (edge) =>
        noSchemaNodeIds.has(edge.source) && noSchemaNodeIds.has(edge.target),
    );
    noSchemaLayouted = getLayoutedNodes(
      noSchemaNodes,
      noSchemaEdges,
      layoutOptions,
    );
  }

  // Layout each schema group using smart layout
  const layoutedGroups: Record<string, FlowNode[]> = {};
  const groupBounds: Record<string, { width: number; height: number }> = {};

  Object.entries(schemaGroups).forEach(([schema, schemaNodes]) => {
    // Filter edges to only include edges within this schema
    const schemaNodeIds = new Set(schemaNodes.map((n) => n.id));
    const schemaEdges = edges.filter(
      (edge) =>
        schemaNodeIds.has(edge.source) && schemaNodeIds.has(edge.target),
    );

    // Layout this schema group using smart layout
    const layouted = getLayoutedNodes(schemaNodes, schemaEdges, layoutOptions);
    const normalized = normalizeToOrigin(layouted);
    layoutedGroups[schema] = normalized;

    // Calculate bounds for this group
    const bounds = getBoundingBox(normalized);
    groupBounds[schema] = { width: bounds.width, height: bounds.height };
  });

  // Position schema groups with row wrapping
  const schemaSpacing = 200;
  const maxRowWidth = 2000;
  let currentX = 0;
  let currentY = 0;
  let rowMaxHeight = 0;

  const finalLayoutedNodes: FlowNode[] = [];

  // Add nodes without schemas first
  if (noSchemaLayouted.length > 0) {
    const normalized = normalizeToOrigin(noSchemaLayouted);
    finalLayoutedNodes.push(...normalized);
    const noSchemaBounds = getBoundingBox(normalized);

    // Check for row wrap
    currentX = noSchemaBounds.width + schemaSpacing;
    rowMaxHeight = noSchemaBounds.height;
  }

  // Then add schema groups
  Object.entries(layoutedGroups).forEach(([schema, schemaNodes]) => {
    const groupWidth = groupBounds[schema].width;
    const groupHeight = groupBounds[schema].height;

    // Check if we need to wrap to next row
    if (currentX > 0 && currentX + groupWidth > maxRowWidth) {
      currentX = 0;
      currentY += rowMaxHeight + schemaSpacing / 2;
      rowMaxHeight = 0;
    }

    // Offset all nodes in this group
    const offsetNodesResult = schemaNodes.map((node) => ({
      ...node,
      position: {
        x: node.position.x + currentX,
        y: node.position.y + currentY,
      },
    }));

    finalLayoutedNodes.push(...offsetNodesResult);
    currentX += groupWidth + schemaSpacing;
    rowMaxHeight = Math.max(rowMaxHeight, groupHeight);
  });

  return finalLayoutedNodes;
}
