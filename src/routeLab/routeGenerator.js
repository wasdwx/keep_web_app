const DEG_TO_RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed) {
  let hash = 2166136261 >>> 0;
  const text = String(seed ?? 'keep-route-seed');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return function mulberry32() {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function createPointKey(x, y) {
  return `${Math.round(x)},${Math.round(y)}`;
}

function pointToMaskIndex(x, y, width, height) {
  const clampedX = clamp(Math.round(x), 0, width - 1);
  const clampedY = clamp(Math.round(y), 0, height - 1);
  return clampedY * width + clampedX;
}

function isWalkableAt(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }

  return mask[pointToMaskIndex(x, y, width, height)] === 1;
}

function findNearbyWalkablePoint(mask, width, height, x, y, radius = 6) {
  if (isWalkableAt(mask, width, height, x, y)) {
    return { x, y };
  }

  for (let currentRadius = 1; currentRadius <= radius; currentRadius += 1) {
    for (let offsetY = -currentRadius; offsetY <= currentRadius; offsetY += 1) {
      for (let offsetX = -currentRadius; offsetX <= currentRadius; offsetX += 1) {
        const candidateX = x + offsetX;
        const candidateY = y + offsetY;
        if (isWalkableAt(mask, width, height, candidateX, candidateY)) {
          return { x: candidateX, y: candidateY };
        }
      }
    }
  }

  return null;
}

function segmentIsWalkable(mask, width, height, from, to) {
  const length = Math.max(1, Math.ceil(distanceBetween(from, to)));
  for (let step = 0; step <= length; step += 1) {
    const progress = step / length;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    if (!isWalkableAt(mask, width, height, x, y)) {
      return false;
    }
  }
  return true;
}

function buildCandidateAngles(heading, rng) {
  const baseOffsets = [0, -0.2, 0.2, -0.45, 0.45, -0.9, 0.9, -1.35, 1.35, Math.PI];
  const randomOffsets = Array.from({ length: 4 }, () => (rng() - 0.5) * Math.PI * 1.5);
  return [...baseOffsets, ...randomOffsets].map((offset) => heading + offset);
}

function proximityToOlderPath(point, path, maxDistance, skipRecentCount) {
  const threshold = maxDistance * maxDistance;
  for (let index = 0; index < Math.max(0, path.length - skipRecentCount); index += 2) {
    const candidate = path[index];
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    if ((dx * dx) + (dy * dy) <= threshold) {
      return 1;
    }
  }
  return 0;
}

function markVisitedHeat(heat, width, height, point) {
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      if (x >= 0 && y >= 0 && x < width && y < height) {
        const index = y * width + x;
        heat[index] = Math.min(255, heat[index] + 1);
      }
    }
  }
}

function interpolatePoints(from, to, spacing) {
  const distance = distanceBetween(from, to);
  if (distance <= spacing) {
    return [{ ...to }];
  }

  const points = [];
  const steps = Math.max(1, Math.round(distance / spacing));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    points.push({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
  }
  return points;
}

function normalizeLinePoints(points) {
  const normalized = [];
  for (const point of points ?? []) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    const candidate = { x, y };
    const previous = normalized.at(-1);
    if (!previous || distanceBetween(previous, candidate) >= 0.75) {
      normalized.push(candidate);
    }
  }
  return normalized;
}

function chooseWeightedCandidate(candidates, rng) {
  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rng() * total;

  for (const candidate of candidates) {
    threshold -= candidate.weight;
    if (threshold <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

function getWalkablePointPool(mask, width, height) {
  const result = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWalkableAt(mask, width, height, x, y)) {
        continue;
      }

      let walkableNeighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }
          if (isWalkableAt(mask, width, height, x + offsetX, y + offsetY)) {
            walkableNeighbors += 1;
          }
        }
      }

      if (walkableNeighbors >= 2) {
        result.push({ x, y });
      }
    }
  }

  return result;
}

function reversePolyline(points) {
  return points.slice().reverse().map((point) => ({ ...point }));
}

function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function normalizeAngleDiff(angleA, angleB) {
  let diff = angleA - angleB;
  while (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  while (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return diff;
}

function bendTurnaroundSegment(points, origin, directionAngle, options = {}) {
  const amplitude = Math.max(0, Number(options.amplitude) || 0);
  if (!points.length || amplitude <= 0) {
    return points.map((point) => ({ ...point }));
  }

  const side = options.side === -1 ? -1 : 1;
  const taperDistance = Math.max(amplitude * 2.8, Number(options.taperDistance) || amplitude * 4);
  const perpendicular = {
    x: -Math.sin(directionAngle) * side,
    y: Math.cos(directionAngle) * side,
  };
  const forward = {
    x: Math.cos(directionAngle),
    y: Math.sin(directionAngle),
  };
  const leadOut = [
    {
      x: origin.x + perpendicular.x * amplitude * 0.55 - forward.x * amplitude * 0.12,
      y: origin.y + perpendicular.y * amplitude * 0.55 - forward.y * amplitude * 0.12,
    },
    {
      x: origin.x + perpendicular.x * amplitude * 1.08 + forward.x * amplitude * 0.28,
      y: origin.y + perpendicular.y * amplitude * 1.08 + forward.y * amplitude * 0.28,
    },
  ];
  const shaped = [];
  let travelled = 0;
  let previous = origin;

  for (const point of points) {
    travelled += distanceBetween(previous, point);
    previous = point;
    const remain = clamp(1 - travelled / taperDistance, 0, 1);
    const easedOffset = amplitude * remain * remain;
    shaped.push({
      x: point.x + perpendicular.x * easedOffset,
      y: point.y + perpendicular.y * easedOffset,
    });
  }

  return [...leadOut, ...shaped];
}

function projectPointsToMask(points, mask, width, height, radius = 6) {
  return points.map((point) => {
    if (isWalkableAt(mask, width, height, point.x, point.y)) {
      return { ...point };
    }
    return findNearbyWalkablePoint(mask, width, height, point.x, point.y, radius) ?? { ...point };
  });
}

function computePolylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetween(points[index - 1], points[index]);
  }
  return total;
}

function createGraphNodeRegistry(nodes, snapRadius) {
  return function getNodeForPoint(point) {
    const existing = nodes.find((node) => distanceBetween(node, point) <= snapRadius);
    if (existing) {
      return existing;
    }

    const node = {
      id: `node-${nodes.length + 1}`,
      x: Number(point.x.toFixed(2)),
      y: Number(point.y.toFixed(2)),
    };
    nodes.push(node);
    return node;
  };
}

function ensureMapSet(map, key) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
}

function findNearestNode(nodes, point, radius) {
  let bestNode = null;
  let bestDistance = radius;

  for (const node of nodes) {
    const distance = distanceBetween(node, point);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestNode = node;
    }
  }

  return bestNode;
}

export function estimateMetersPerPixel(latitude, zoom) {
  const safeLatitude = clamp(Number(latitude) || 0, -85, 85);
  const safeZoom = Math.max(1, Number(zoom) || 17);
  return 156543.03392 * Math.cos(safeLatitude * DEG_TO_RAD) / (2 ** safeZoom);
}

export function extractWalkableMask(imageData, width, height) {
  const source = imageData?.data ?? imageData;
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const base = index * 4;
    const r = source[base];
    const g = source[base + 1];
    const b = source[base + 2];
    const a = source[base + 3];
    mask[index] = a >= 200 && r >= 240 && g <= 40 && b <= 40 ? 1 : 0;
  }

  return mask;
}

export function removeSmallMaskIslands(mask, width, height, minComponentSize = 18) {
  const visited = new Uint8Array(mask.length);
  const cleaned = new Uint8Array(mask.length);
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (let startIndex = 0; startIndex < mask.length; startIndex += 1) {
    if (!mask[startIndex] || visited[startIndex]) {
      continue;
    }

    const component = [];
    const queue = [startIndex];
    visited[startIndex] = 1;

    while (queue.length > 0) {
      const index = queue.pop();
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);

      for (const [offsetX, offsetY] of neighbors) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue;
        }
        const nextIndex = nextY * width + nextX;
        if (!mask[nextIndex] || visited[nextIndex]) {
          continue;
        }
        visited[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }

    if (component.length >= minComponentSize) {
      for (const index of component) {
        cleaned[index] = 1;
      }
    }
  }

  return cleaned;
}

export function computeRouteLength(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetween(points[index - 1], points[index]);
  }
  return total;
}

export function smoothRoutePoints(points, windowSize = 5) {
  const size = Math.max(1, Math.round(windowSize));
  if (points.length <= 2 || size <= 1) {
    return points.map((point) => ({ ...point }));
  }

  const smoothed = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = Math.max(0, index - Math.floor(size / 2));
    const end = Math.min(points.length, index + Math.floor(size / 2) + 1);
    let sumX = 0;
    let sumY = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sumX += points[cursor].x;
      sumY += points[cursor].y;
    }
    smoothed.push({
      x: sumX / (end - start),
      y: sumY / (end - start),
    });
  }

  return smoothed;
}

export function resampleRoutePoints(points, spacing = 4) {
  if (points.length < 2) {
    return points.map((point) => ({ ...point }));
  }

  const step = Math.max(1, spacing);
  const resampled = [{ ...points[0] }];
  let previous = points[0];
  let carry = 0;

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const segmentLength = distanceBetween(previous, current);
    if (segmentLength === 0) {
      continue;
    }

    let travelled = step - carry;
    while (travelled <= segmentLength) {
      const ratio = travelled / segmentLength;
      resampled.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      });
      travelled += step;
    }

    carry = segmentLength - (travelled - step);
    previous = current;
  }

  const last = points.at(-1);
  const lastResampled = resampled.at(-1);
  if (distanceBetween(last, lastResampled) > 0.5) {
    resampled.push({ ...last });
  }

  return resampled;
}

export function applyRouteJitter(points, options) {
  const {
    amplitude = 0,
    seed = 'keep-route-seed',
    mask,
    width,
    height,
  } = options;

  if (!points.length || amplitude <= 0) {
    return points.map((point) => ({ ...point }));
  }

  const rng = createSeededRandom(`jitter:${seed}`);
  const anchorStride = 6;
  const anchors = [];
  for (let index = 0; index < points.length; index += anchorStride) {
    anchors.push({
      index,
      dx: (rng() - 0.5) * amplitude * 2,
      dy: (rng() - 0.5) * amplitude * 2,
    });
  }

  if (anchors.at(-1)?.index !== points.length - 1) {
    anchors.push({
      index: points.length - 1,
      dx: 0,
      dy: 0,
    });
  }

  return points.map((point, index) => {
    let leftAnchor = anchors[0];
    let rightAnchor = anchors.at(-1);

    for (let cursor = 1; cursor < anchors.length; cursor += 1) {
      if (anchors[cursor].index >= index) {
        rightAnchor = anchors[cursor];
        leftAnchor = anchors[cursor - 1];
        break;
      }
    }

    const span = Math.max(1, rightAnchor.index - leftAnchor.index);
    const progress = (index - leftAnchor.index) / span;
    const dx = leftAnchor.dx + (rightAnchor.dx - leftAnchor.dx) * progress;
    const dy = leftAnchor.dy + (rightAnchor.dy - leftAnchor.dy) * progress;
    const normalized = points.length <= 1 ? 0 : index / (points.length - 1);
    const edgeFade = clamp(Math.min(normalized / 0.12, (1 - normalized) / 0.12, 1), 0, 1);

    const candidate = {
      x: point.x + dx * edgeFade,
      y: point.y + dy * edgeFade,
    };

    if (isWalkableAt(mask, width, height, candidate.x, candidate.y)) {
      return candidate;
    }

    return findNearbyWalkablePoint(mask, width, height, candidate.x, candidate.y, 5) ?? { ...point };
  });
}

export function buildSkeletonGraph(lines = [], snapRadius = 12, options = {}) {
  const closeLoopSnapRadius = Math.max(
    2,
    Number(options.closeLoopSnapRadius ?? (snapRadius * 1.15)),
  );
  const intersectionSnapRadius = Math.max(
    2,
    Number(options.intersectionSnapRadius ?? snapRadius),
  );
  const sampleSpacing = Math.max(
    1.5,
    Math.min(8, Number(options.sampleSpacing ?? (intersectionSnapRadius * 0.45))),
  );

  const normalizedLines = Array.isArray(lines)
    ? lines
      .map((line, index) => {
        const lineId = typeof line?.id === 'string' && line.id ? line.id : `line-${index + 1}`;
        const prepared = createClosedPolylineIfNeeded(line?.points ?? [], closeLoopSnapRadius);
        return {
          id: lineId,
          closed: prepared.closed,
          points: prepared.points,
        };
      })
      .filter((line) => line.points.length >= 2)
    : [];
  const normalizedRoadEndNodes = Array.isArray(options.roadEndNodes)
    ? options.roadEndNodes
      .map((node, index) => ({
        id: typeof node?.id === 'string' && node.id ? node.id : `road-end-${index + 1}`,
        x: Number(node?.x),
        y: Number(node?.y),
      }))
      .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
    : [];

  const nodes = [];
  const getNodeForPoint = createGraphNodeRegistry(nodes, intersectionSnapRadius);
  const edges = [];
  const adjacency = new Map();
  const lineNodeSequences = new Map();

  normalizedLines.forEach((line, lineIndex) => {
    const sampledPoints = samplePolylinePoints(line.points, sampleSpacing);
    if (sampledPoints.length < 2) {
      return;
    }

    let previousNode = getNodeForPoint(sampledPoints[0]);
    attachLineIdToNode(previousNode, line.id);
    const lineNodeSequence = [previousNode.id];
    let segmentPoints = [{ x: previousNode.x, y: previousNode.y }];

    for (let pointIndex = 1; pointIndex < sampledPoints.length; pointIndex += 1) {
      const sampledPoint = sampledPoints[pointIndex];
      const currentNode = getNodeForPoint(sampledPoint);
      attachLineIdToNode(currentNode, line.id);
      const previousDrawPoint = segmentPoints.at(-1);

      if (!previousDrawPoint || distanceBetween(previousDrawPoint, sampledPoint) >= 0.4) {
        segmentPoints.push({ x: sampledPoint.x, y: sampledPoint.y });
      }

      if (currentNode.id === previousNode.id) {
        continue;
      }

      if (lineNodeSequence.at(-1) !== currentNode.id) {
        lineNodeSequence.push(currentNode.id);
      }

      segmentPoints[0] = { x: previousNode.x, y: previousNode.y };
      segmentPoints[segmentPoints.length - 1] = { x: currentNode.x, y: currentNode.y };

      const polylinePoints = normalizeLinePoints(segmentPoints);
      if (polylinePoints.length >= 2) {
        const edgeId = `${line.id || `line-${lineIndex + 1}`}-edge-${edges.length + 1}`;
        const edge = {
          id: edgeId,
          lineId: line.id,
          from: previousNode.id,
          to: currentNode.id,
          lengthPx: Number(computePolylineLength(polylinePoints).toFixed(2)),
          polylinePoints,
        };
        edges.push(edge);
        linkAdjacency(adjacency, previousNode.id, edge.id);
        linkAdjacency(adjacency, currentNode.id, edge.id);
      }

      previousNode = currentNode;
      segmentPoints = [{ x: currentNode.x, y: currentNode.y }];
    }

    lineNodeSequences.set(line.id, {
      closed: line.closed,
      nodeIds: lineNodeSequence,
    });
  });

  const { cycleComponents, cycleComponentMap, cycleNodeIds } = annotateCycleComponents(nodes, edges, adjacency);
  const lineBoundaryMap = new Map();

  for (const line of normalizedLines) {
    const sequence = lineNodeSequences.get(line.id)?.nodeIds ?? [];
    if (!line.closed && sequence.length >= 2) {
      ensureMapSet(lineBoundaryMap, line.id).add(sequence[0]);
      ensureMapSet(lineBoundaryMap, line.id).add(sequence.at(-1));
    }
  }

  const roadEndNodeIds = new Set();
  const snappedRoadEndNodes = normalizedRoadEndNodes
    .map((roadEnd) => {
      const snappedNode = findNearestNode(nodes, roadEnd, Math.max(intersectionSnapRadius * 1.2, snapRadius * 1.35));
      if (!snappedNode) {
        return null;
      }

      roadEndNodeIds.add(snappedNode.id);
      snappedNode.isRoadEnd = true;
      snappedNode.roadEndIds = [...new Set([...(snappedNode.roadEndIds ?? []), roadEnd.id])];

      for (const lineId of snappedNode.lineIds ?? []) {
        ensureMapSet(lineBoundaryMap, lineId).add(snappedNode.id);
      }

      return {
        id: roadEnd.id,
        x: snappedNode.x,
        y: snappedNode.y,
        nodeId: snappedNode.id,
        lineIds: [...(snappedNode.lineIds ?? [])],
      };
    })
    .filter(Boolean);

  return {
    nodes: nodes.map((node) => {
      const lineIds = [...(node.lineIds ?? [])];
      const degree = (adjacency.get(node.id) ?? []).length;
      const boundaryLineIds = lineIds.filter((lineId) => lineBoundaryMap.get(lineId)?.has(node.id));
      return {
        id: node.id,
        x: node.x,
        y: node.y,
        degree,
        lineIds,
        lineCount: lineIds.length,
        isBranch: degree >= 3 || lineIds.length >= 2,
        inCycle: cycleNodeIds.has(node.id),
        isRoadEnd: roadEndNodeIds.has(node.id),
        isBoundary: boundaryLineIds.length > 0,
        boundaryLineIds,
      };
    }),
    edges,
    adjacency,
    cycleComponents,
    cycleComponentMap,
    lineBoundaryMap,
    snappedRoadEndNodes,
  };
}

function attachLineIdToNode(node, lineId) {
  if (!node.lineIds) {
    node.lineIds = new Set();
  }
  if (lineId) {
    node.lineIds.add(lineId);
  }
}

function createClosedPolylineIfNeeded(points, closeLoopSnapRadius) {
  const normalized = normalizeLinePoints(points);
  if (normalized.length < 3) {
    return { points: normalized, closed: false };
  }

  const first = normalized[0];
  const last = normalized.at(-1);
  if (distanceBetween(first, last) > closeLoopSnapRadius) {
    return { points: normalized, closed: false };
  }

  return {
    points: [...normalized.slice(0, -1), { ...first }],
    closed: true,
  };
}

function samplePolylinePoints(points, spacing) {
  if (!Array.isArray(points) || points.length < 2) {
    return points?.map((point) => ({ ...point })) ?? [];
  }

  const step = Math.max(1.5, spacing);
  const sampled = [{ ...points[0] }];
  for (let index = 1; index < points.length; index += 1) {
    const segmentPoints = interpolatePoints(points[index - 1], points[index], step);
    for (const point of segmentPoints) {
      const previous = sampled.at(-1);
      if (!previous || distanceBetween(previous, point) >= 0.75) {
        sampled.push(point);
      }
    }
  }
  return sampled;
}

function linkAdjacency(adjacency, nodeId, edgeId) {
  const list = adjacency.get(nodeId) ?? [];
  list.push(edgeId);
  adjacency.set(nodeId, list);
}

function findAlternatePath(startNodeId, targetNodeId, adjacency, edgeMap, excludedEdgeId) {
  const visited = new Set([startNodeId]);
  const queue = [startNodeId];

  while (queue.length) {
    const currentNodeId = queue.shift();
    for (const edgeId of adjacency.get(currentNodeId) ?? []) {
      if (edgeId === excludedEdgeId) {
        continue;
      }
      const edge = edgeMap.get(edgeId);
      const nextNodeId = edge.from === currentNodeId ? edge.to : edge.from;
      if (nextNodeId === targetNodeId) {
        return true;
      }
      if (visited.has(nextNodeId)) {
        continue;
      }
      visited.add(nextNodeId);
      queue.push(nextNodeId);
    }
  }

  return false;
}

function annotateCycleComponents(nodes, edges, adjacency) {
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));

  for (const edge of edges) {
    edge.inCycle = findAlternatePath(edge.from, edge.to, adjacency, edgeMap, edge.id);
  }

  const cycleComponents = [];
  const visitedCycleEdges = new Set();

  for (const edge of edges) {
    if (!edge.inCycle || visitedCycleEdges.has(edge.id)) {
      continue;
    }

    const component = {
      id: `cycle-${cycleComponents.length + 1}`,
      edgeIds: new Set(),
      nodeIds: new Set(),
      totalLengthPx: 0,
    };
    const queue = [edge.id];

    while (queue.length) {
      const edgeId = queue.pop();
      if (visitedCycleEdges.has(edgeId)) {
        continue;
      }
      visitedCycleEdges.add(edgeId);
      const currentEdge = edgeMap.get(edgeId);
      if (!currentEdge?.inCycle) {
        continue;
      }

      component.edgeIds.add(edgeId);
      component.nodeIds.add(currentEdge.from);
      component.nodeIds.add(currentEdge.to);
      component.totalLengthPx += currentEdge.lengthPx;
      currentEdge.cycleComponentId = component.id;

      for (const nodeId of [currentEdge.from, currentEdge.to]) {
        for (const adjacentEdgeId of adjacency.get(nodeId) ?? []) {
          const adjacentEdge = edgeMap.get(adjacentEdgeId);
          if (adjacentEdge?.inCycle && !visitedCycleEdges.has(adjacentEdgeId)) {
            queue.push(adjacentEdgeId);
          }
        }
      }
    }

    cycleComponents.push({
      id: component.id,
      edgeIds: [...component.edgeIds],
      nodeIds: [...component.nodeIds],
      totalLengthPx: Number(component.totalLengthPx.toFixed(2)),
    });
  }

  const cycleComponentMap = new Map(cycleComponents.map((component) => [component.id, component]));
  const cycleNodeIds = new Set(cycleComponents.flatMap((component) => component.nodeIds));

  return {
    cycleComponents,
    cycleComponentMap,
    cycleNodeIds,
  };
}

function generateMaskOnlyRoute(options) {
  const {
    walkableMask,
    imageData,
    width,
    height,
    targetDistancePx,
    targetDistanceKm = 2.5,
    seed = 'keep-route-seed',
    loopBias = 0.65,
    stepPx = 6,
    latitude = 40,
    zoom = 17,
    metersPerPixel = estimateMetersPerPixel(latitude, zoom),
    startPoint = null,
    initialHeading = null,
  } = options;

  const cleanedMask = walkableMask ?? removeSmallMaskIslands(
    extractWalkableMask(imageData, width, height),
    width,
    height,
    Math.max(18, Math.round(stepPx * stepPx * 0.55)),
  );

  const walkablePool = getWalkablePointPool(cleanedMask, width, height);
  if (!walkablePool.length) {
    throw new Error('掩码里没有可通行区域，请先用红色画出可走路线带。');
  }

  const rng = createSeededRandom(seed);
  const start = startPoint
    ? (findNearbyWalkablePoint(cleanedMask, width, height, startPoint.x, startPoint.y, 6) ?? walkablePool[0])
    : walkablePool[Math.floor(rng() * walkablePool.length)];
  const visitedHeat = new Uint8Array(width * height);
  const path = [{ ...start }];
  const visitedKeys = new Set([createPointKey(start.x, start.y)]);

  let current = { ...start };
  let heading = initialHeading ?? (rng() * Math.PI * 2);
  let travelledPx = 0;
  const desiredDistancePx = Math.max(
    stepPx * 18,
    targetDistancePx ?? ((targetDistanceKm * 1000) / Math.max(0.01, metersPerPixel)),
  );
  const maxSteps = Math.max(320, Math.ceil(desiredDistancePx / Math.max(1, stepPx)) * 10);

  markVisitedHeat(visitedHeat, width, height, current);

  for (let step = 0; step < maxSteps; step += 1) {
    const progress = travelledPx / desiredDistancePx;
    const candidates = [];

    for (const angle of buildCandidateAngles(heading, rng)) {
      const stride = stepPx * (0.92 + rng() * 0.18);
      const next = {
        x: current.x + Math.cos(angle) * stride,
        y: current.y + Math.sin(angle) * stride,
      };

      if (!segmentIsWalkable(cleanedMask, width, height, current, next)) {
        continue;
      }

      const nextKey = createPointKey(next.x, next.y);
      const nextIndex = pointToMaskIndex(next.x, next.y, width, height);
      const inertia = (Math.cos(angle - heading) + 1) / 2;
      const loopScore = progress > 0.28 ? proximityToOlderPath(next, path, stepPx * 2.8, 14) : 0;
      const returnBias = progress > 0.72
        ? clamp(1 - distanceBetween(next, start) / (stepPx * 11), 0, 1)
        : 0;
      const revisitPenalty = (visitedHeat[nextIndex] / 8) + (visitedKeys.has(nextKey) ? 0.6 : 0);
      const earlyLoopPenalty = progress < 0.2 && loopScore > 0 ? 0.45 : 0;
      const weight = Math.max(
        0.05,
        0.85
          + (inertia * 1.2)
          + (loopBias * loopScore * 1.15)
          + (returnBias * 0.9)
          - revisitPenalty
          - earlyLoopPenalty
          + (rng() * 0.18),
      );

      candidates.push({
        next,
        weight,
        angle,
      });
    }

    if (!candidates.length) {
      break;
    }

    const chosen = chooseWeightedCandidate(candidates, rng);
    const segmentPoints = interpolatePoints(current, chosen.next, Math.max(1, stepPx * 0.75));
    for (const point of segmentPoints) {
      path.push(point);
      travelledPx += distanceBetween(path[path.length - 2], point);
      visitedKeys.add(createPointKey(point.x, point.y));
      markVisitedHeat(visitedHeat, width, height, point);
    }

    current = path.at(-1);
    heading = chosen.angle;

    if (travelledPx >= desiredDistancePx) {
      const canCloseLoop = distanceBetween(current, start) <= stepPx * 3.2
        && segmentIsWalkable(cleanedMask, width, height, current, start);

      if (canCloseLoop) {
        for (const point of interpolatePoints(current, start, Math.max(1, stepPx * 0.65))) {
          path.push(point);
        }
      }
      break;
    }
  }

  if (path.length < 2) {
    throw new Error('轨迹生成失败，请把掩码画得更连贯一些。');
  }

  return {
    points: projectPointsToMask(path, cleanedMask, width, height),
    walkableMask: cleanedMask,
    lastHeading: heading,
    strategy: startPoint ? 'mask-fallback' : 'mask-only',
  };
}

function chooseSkeletonStartNode(graph, rng, loopBias = 0.7) {
  const candidates = graph.nodes.filter((node) => node.degree >= 2);
  const pool = candidates.length ? candidates : graph.nodes;
  const ranked = pool.map((node) => ({
    node,
    weight:
      1
      + Math.max(0, node.degree - 1) * 0.4
      + (node.inCycle ? loopBias * 0.75 : 0)
      + (node.isBoundary ? 0.55 : 0)
      + (node.isRoadEnd ? 0.35 : 0),
  }));
  return chooseWeightedCandidate(ranked, rng).node;
}

function orientEdgePoints(edge, currentNodeId) {
  if (edge.from === currentNodeId) {
    return edge.polylinePoints.map((point) => ({ ...point }));
  }
  return reversePolyline(edge.polylinePoints);
}

function getEdgeDirectionAngle(edge, currentNodeId) {
  const points = orientEdgePoints(edge, currentNodeId);
  if (points.length < 2) {
    return 0;
  }
  const sampleIndex = Math.min(points.length - 1, 3);
  return angleBetween(points[0], points[sampleIndex]);
}

function getCycleCoverage(progressMap, componentId) {
  if (!componentId) {
    return { coveredLength: 0, totalLength: 0, coverage: 0 };
  }

  const progress = progressMap.get(componentId);
  if (!progress) {
    return { coveredLength: 0, totalLength: 0, coverage: 0 };
  }

  const coverage = progress.totalLength > 0 ? progress.coveredLength / progress.totalLength : 0;
  return {
    coveredLength: progress.coveredLength,
    totalLength: progress.totalLength,
    coverage,
  };
}

function isBoundaryNodeForLine(nodeId, lineId, graph) {
  if (!lineId) {
    return true;
  }
  return graph.lineBoundaryMap?.get(lineId)?.has(nodeId) ?? false;
}

function generateSkeletonGuidedPath(options) {
  const {
    graph,
    targetDistancePx,
    seed,
    loopBias,
    stepPx,
    skeletonFollowBias,
    branchSwitchPenalty,
    deadEndPenalty,
    cycleExitPenalty,
    minLoopCoverage,
    turnaroundAmplitudePx = 12,
  } = options;

  if (!graph.edges.length) {
    return null;
  }

  const rng = createSeededRandom(`skeleton:${seed}`);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const startNode = chooseSkeletonStartNode(graph, rng, loopBias);
  const startPoint = { x: startNode.x, y: startNode.y };
  const path = [{ ...startPoint }];
  const edgeVisits = new Map();
  const nodeVisits = new Map([[startNode.id, 1]]);
  const recentEdges = [];
  const cycleProgress = new Map(
    (graph.cycleComponents ?? []).map((component) => [
      component.id,
      {
        totalLength: component.totalLengthPx,
        coveredLength: 0,
        edgeIds: new Set(),
      },
    ]),
  );

  let currentNodeId = startNode.id;
  let currentLineId = null;
  let previousAngle = null;
  let activeCycleComponentId = null;
  let travelledPx = 0;
  const maxTransitions = Math.max(32, Math.ceil(targetDistancePx / Math.max(1, stepPx * 0.9)) * 5);

  for (let transition = 0; transition < maxTransitions; transition += 1) {
    const adjacency = graph.adjacency.get(currentNodeId) ?? [];
    if (!adjacency.length) {
      break;
    }

    const currentNode = nodeMap.get(currentNodeId);
    const progress = targetDistancePx <= 0 ? 0 : travelledPx / targetDistancePx;
    const atBoundaryForCurrentLine = currentLineId
      ? isBoundaryNodeForLine(currentNodeId, currentLineId, graph)
      : true;
    const shouldStayOnCurrentLine = currentLineId
      && !atBoundaryForCurrentLine
      && adjacency.some((edgeId) => edgeMap.get(edgeId)?.lineId === currentLineId);
    const candidates = [];

    for (const edgeId of adjacency) {
      const edge = edgeMap.get(edgeId);
      const nextNodeId = edge.from === currentNodeId ? edge.to : edge.from;
      const nextNode = nodeMap.get(nextNodeId);
      const sameLine = !currentLineId || edge.lineId === currentLineId;
      if (shouldStayOnCurrentLine && !sameLine) {
        continue;
      }
      const directionAngle = getEdgeDirectionAngle(edge, currentNodeId);
      const inertia = previousAngle === null
        ? 1
        : (Math.cos(normalizeAngleDiff(directionAngle, previousAngle)) + 1) / 2;
      const closeLoop = progress > 0.55
        ? clamp(1 - distanceBetween(nextNode, startNode) / Math.max(stepPx * 12, 1), 0, 1)
        : 0;
      const edgeVisitCount = edgeVisits.get(edgeId) ?? 0;
      const nodeVisitCount = nodeVisits.get(nextNodeId) ?? 0;
      const degreeNext = graph.adjacency.get(nextNodeId)?.length ?? 0;
      const deadEndPenaltyScore = degreeNext <= 1 && progress < 0.9 ? 1 : 0;
      const reversePenalty = recentEdges.includes(edgeId) ? 1 : 0;
      const branchPenaltyScore = previousAngle === null ? 0 : (1 - inertia);
      const underusedBonus = edgeVisitCount === 0 ? 0.4 : 0;
      const cycleCoverage = getCycleCoverage(cycleProgress, edge.cycleComponentId);
      const activeCycleCoverage = getCycleCoverage(cycleProgress, activeCycleComponentId);
      const enteringCycleBonus = edge.cycleComponentId
        ? (activeCycleComponentId === edge.cycleComponentId ? 0.48 : 0.16)
        : 0;
      const stayOnCycleBonus = edge.cycleComponentId
        ? Math.max(0, (1 - cycleCoverage.coverage) * 0.55)
        : 0;
      const roadExitPenalty = currentLineId && !sameLine && !atBoundaryForCurrentLine
        ? (2.35 + (1 - progress) * 0.85)
        : 0;
      const midRoadStayBonus = currentLineId && sameLine && !atBoundaryForCurrentLine
        ? 0.72
        : 0;
      const visibleTurnaroundBonus = currentLineId
        && sameLine
        && !atBoundaryForCurrentLine
        && previousAngle !== null
        && inertia < 0.2
        ? 0.95
        : 0;
      const exitCyclePenalty = activeCycleComponentId && edge.cycleComponentId !== activeCycleComponentId
        && activeCycleCoverage.coverage < minLoopCoverage
        && progress < 0.96
        ? cycleExitPenalty * (1 + (minLoopCoverage - activeCycleCoverage.coverage))
        : 0;

      const weight = Math.max(
        0.02,
        1.1
          + skeletonFollowBias * inertia
          + loopBias * 1.4 * closeLoop
          + loopBias * enteringCycleBonus
          + stayOnCycleBonus
          + midRoadStayBonus
          + visibleTurnaroundBonus
          + underusedBonus
          - branchSwitchPenalty * branchPenaltyScore
          - deadEndPenalty * deadEndPenaltyScore
          - exitCyclePenalty
          - roadExitPenalty
          - edgeVisitCount * 0.85
          - nodeVisitCount * 0.25
          - reversePenalty * 1.35
          + rng() * 0.06,
      );

      candidates.push({
        edge,
        nextNode,
        nextNodeId,
        directionAngle,
        weight,
      });
    }

    if (!candidates.length) {
      break;
    }

    const chosen = chooseWeightedCandidate(candidates, rng);
    const orientedPoints = orientEdgePoints(chosen.edge, currentNodeId);
    const segmentPoints = [];
    for (let index = 1; index < orientedPoints.length; index += 1) {
      segmentPoints.push(
        ...interpolatePoints(orientedPoints[index - 1], orientedPoints[index], Math.max(1, stepPx * 0.75)),
      );
    }

    if (!segmentPoints.length) {
      break;
    }

    const directionDiff = previousAngle === null
      ? 0
      : Math.abs(normalizeAngleDiff(chosen.directionAngle, previousAngle));
    const isImmediateTurnaround = recentEdges.at(-1) === chosen.edge.id
      || (directionDiff > Math.PI * 0.72 && (edgeVisits.get(chosen.edge.id) ?? 0) > 0);
    if (isImmediateTurnaround) {
      const amplitude = Math.max(0, Number(turnaroundAmplitudePx) || 0);
      const bentPoints = bendTurnaroundSegment(segmentPoints, currentNode, chosen.directionAngle, {
        amplitude,
        taperDistance: Math.max(stepPx * 7, amplitude * 4.2),
        side: rng() < 0.5 ? -1 : 1,
      });
      segmentPoints.splice(0, segmentPoints.length, ...bentPoints);
    }

    for (const point of segmentPoints) {
      path.push(point);
      travelledPx += distanceBetween(path[path.length - 2], point);
    }

    edgeVisits.set(chosen.edge.id, (edgeVisits.get(chosen.edge.id) ?? 0) + 1);
    nodeVisits.set(chosen.nextNodeId, (nodeVisits.get(chosen.nextNodeId) ?? 0) + 1);

    if (chosen.edge.cycleComponentId) {
      const progressEntry = cycleProgress.get(chosen.edge.cycleComponentId);
      if (progressEntry && !progressEntry.edgeIds.has(chosen.edge.id)) {
        progressEntry.edgeIds.add(chosen.edge.id);
        progressEntry.coveredLength += chosen.edge.lengthPx;
      }
      activeCycleComponentId = chosen.edge.cycleComponentId;
    } else if (activeCycleComponentId) {
      const activeCoverage = getCycleCoverage(cycleProgress, activeCycleComponentId);
      if (activeCoverage.coverage >= minLoopCoverage || progress >= 0.94) {
        activeCycleComponentId = null;
      }
    }

    currentNodeId = chosen.nextNodeId;
    currentLineId = chosen.edge.lineId ?? currentLineId;
    previousAngle = chosen.directionAngle;
    recentEdges.push(chosen.edge.id);
    if (recentEdges.length > 4) {
      recentEdges.shift();
    }

    if (travelledPx >= targetDistancePx) {
      const activeCoverage = getCycleCoverage(cycleProgress, activeCycleComponentId);
      if (activeCycleComponentId && activeCoverage.coverage < minLoopCoverage && transition < maxTransitions - 1) {
        continue;
      }
      break;
    }
  }

  if (path.length < 2) {
    return null;
  }

  return {
    points: path,
    totalDistancePx: computeRouteLength(path),
    lastHeading: previousAngle,
    strategy: 'skeleton-guided',
  };
}

export function generateMaskConstrainedRoute(options) {
  const {
    imageData,
    width,
    height,
    targetDistanceKm = 2.5,
    seed = 'keep-route-seed',
    loopBias = 0.65,
    stepPx = 6,
    smoothingWindow = 5,
    jitterAmplitudePx = 1.2,
    latitude = 40,
    zoom = 17,
    metersPerPixel = estimateMetersPerPixel(latitude, zoom),
    skeleton = { lines: [] },
    roadEndNodes = [],
    skeletonSnapRadiusPx = 12,
    closeLoopSnapRadiusPx = 14,
    intersectionSnapRadiusPx = 10,
    skeletonFollowBias = 0.9,
    branchSwitchPenalty = 0.88,
    deadEndPenalty = 1.1,
    maskFallbackBias = 0.2,
    cycleExitPenalty = 1.45,
    minLoopCoverage = 0.72,
    turnaroundAmplitudePx = 12,
  } = options;

  const walkableMask = removeSmallMaskIslands(
    extractWalkableMask(imageData, width, height),
    width,
    height,
    Math.max(18, Math.round(stepPx * stepPx * 0.55)),
  );

  const walkablePool = getWalkablePointPool(walkableMask, width, height);
  if (!walkablePool.length) {
    throw new Error('掩码里没有可通行区域，请先用红色画出可走路线带。');
  }

  const targetPx = Math.max(stepPx * 18, (targetDistanceKm * 1000) / Math.max(0.01, metersPerPixel));
  const graph = buildSkeletonGraph(skeleton?.lines ?? [], skeletonSnapRadiusPx, {
    roadEndNodes,
    closeLoopSnapRadius: closeLoopSnapRadiusPx,
    intersectionSnapRadius: intersectionSnapRadiusPx,
  });

  let baseResult = null;
  let strategy = 'mask-only';

  if (graph.edges.length > 0) {
    const skeletonResult = generateSkeletonGuidedPath({
      graph,
      targetDistancePx: targetPx,
      seed,
      loopBias,
      stepPx,
      skeletonFollowBias,
      branchSwitchPenalty,
      deadEndPenalty,
      cycleExitPenalty,
      minLoopCoverage,
      turnaroundAmplitudePx,
    });

    if (skeletonResult?.points?.length >= 2) {
      const projectedSkeletonPoints = projectPointsToMask(skeletonResult.points, walkableMask, width, height, 6);
      const skeletonDistancePx = computeRouteLength(projectedSkeletonPoints);
      const remainingPx = targetPx - skeletonDistancePx;

      if (remainingPx > stepPx * 8 && maskFallbackBias > 0) {
        const fallbackDistancePx = remainingPx * clamp(maskFallbackBias, 0, 1);
        if (fallbackDistancePx > stepPx * 6) {
          const fallbackResult = generateMaskOnlyRoute({
            walkableMask,
            width,
            height,
            targetDistancePx: fallbackDistancePx,
            seed: `${seed}:mask-fallback`,
            loopBias,
            stepPx,
            latitude,
            zoom,
            metersPerPixel,
            startPoint: projectedSkeletonPoints.at(-1),
            initialHeading: skeletonResult.lastHeading,
          });
          baseResult = {
            points: [...projectedSkeletonPoints, ...fallbackResult.points.slice(1)],
            walkableMask,
          };
          strategy = 'skeleton-plus-fallback';
        }
      }

      if (!baseResult) {
        baseResult = {
          points: projectedSkeletonPoints,
          walkableMask,
        };
        strategy = 'skeleton-guided';
      }
    }
  }

  if (!baseResult) {
    const fallbackResult = generateMaskOnlyRoute({
      walkableMask,
      width,
      height,
      targetDistancePx: targetPx,
      targetDistanceKm,
      seed,
      loopBias,
      stepPx,
      latitude,
      zoom,
      metersPerPixel,
    });
    baseResult = fallbackResult;
    strategy = fallbackResult.strategy ?? 'mask-only';
  }

  if (!baseResult.points || baseResult.points.length < 2) {
    throw new Error('轨迹生成失败，请检查掩码和骨架是否连贯。');
  }

  const adjustedWindow = graph.edges.length > 0
    ? Math.min(Math.max(1, smoothingWindow), 7)
    : smoothingWindow;
  const smoothed = smoothRoutePoints(baseResult.points, adjustedWindow);
  const resampled = resampleRoutePoints(smoothed, Math.max(2, stepPx * 0.55));
  const jittered = applyRouteJitter(resampled, {
    amplitude: jitterAmplitudePx,
    seed,
    mask: walkableMask,
    width,
    height,
  });
  const projected = projectPointsToMask(jittered, walkableMask, width, height, 5);

  return {
    points: projected.map((point) => ({
      x: Number(point.x.toFixed(2)),
      y: Number(point.y.toFixed(2)),
    })),
    walkableMask,
    totalDistancePx: Number(computeRouteLength(projected).toFixed(2)),
    estimatedDistanceKm: Number(((computeRouteLength(projected) * metersPerPixel) / 1000).toFixed(3)),
    metersPerPixel,
    strategy,
  };
}
