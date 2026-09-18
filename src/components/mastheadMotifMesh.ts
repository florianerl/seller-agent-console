import { palette } from "../theme/palette";

export const ROWS = 4;
export const VIEW_H = 64;
export const STEP_MS = 80;
export const FIRE_MS = 500;
export const IDLE = palette.disabled;
export const FIRE = palette.brandRed;
export const CHIP_PX = 44;
export const CHIP_RIGHT = 10;
export const CHIP_VB = 48;
export const CHIP_CX = 24;
export const CHIP_CY = 24;
export const CHIP_BODY = 26;
export const CHIP_HALF = CHIP_BODY / 2;
export const CHIP_PIN = 6;
export const CHIP_PIN_GAP = 7;

export const PIN_TIPS: ReadonlyArray<readonly [number, number]> = [
  [CHIP_CX - CHIP_PIN_GAP, CHIP_CY - CHIP_HALF - CHIP_PIN],
  [CHIP_CX, CHIP_CY - CHIP_HALF - CHIP_PIN],
  [CHIP_CX + CHIP_PIN_GAP, CHIP_CY - CHIP_HALF - CHIP_PIN],
  [CHIP_CX + CHIP_HALF + CHIP_PIN, CHIP_CY - CHIP_PIN_GAP],
  [CHIP_CX + CHIP_HALF + CHIP_PIN, CHIP_CY],
  [CHIP_CX + CHIP_HALF + CHIP_PIN, CHIP_CY + CHIP_PIN_GAP],
  [CHIP_CX - CHIP_PIN_GAP, CHIP_CY + CHIP_HALF + CHIP_PIN],
  [CHIP_CX, CHIP_CY + CHIP_HALF + CHIP_PIN],
  [CHIP_CX + CHIP_PIN_GAP, CHIP_CY + CHIP_HALF + CHIP_PIN],
  [CHIP_CX - CHIP_HALF - CHIP_PIN, CHIP_CY - CHIP_PIN_GAP],
  [CHIP_CX - CHIP_HALF - CHIP_PIN, CHIP_CY],
  [CHIP_CX - CHIP_HALF - CHIP_PIN, CHIP_CY + CHIP_PIN_GAP],
];
export const PIN_COUNT = PIN_TIPS.length;

export function getColsForWidth(width: number): number {
  // Base spacing: 36px left margin + 96px column pitch + 204px satellite/chip zone.
  // (1200 - 144) / 96 = 11 cols at 1200px.
  return Math.max(3, Math.round((width - 144) / 96));
}

export function getViewW(cols: number): number {
  return cols * 96 + 144;
}

export const COLS = typeof window !== "undefined" ? getColsForWidth(window.innerWidth) : 11;
export const GRID = COLS * ROWS;
export const VIEW_W = getViewW(COLS);

function lcg(seed: number) {
  let x = (seed * 1103515245 + 12345) >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function createRng(seed: number) {
  const next = lcg(seed);
  return {
    between(lo: number, hi: number) {
      return lo + (next() % (hi - lo + 1));
    },
    roll(pPermille: number) {
      return next() % 1000 < pPermille;
    },
  };
}

export type Mesh = {
  nodes: Array<readonly [number, number]>;
  edges: Array<readonly [number, number]>;
  pinBase: number;
  adj: number[][];
  edgeIndex: Map<string, number>;
  cols: number;
  viewW: number;
};

/** Same skeleton every time; jitter and optional chords change with the seed. */
export function createMesh(seed: number, cols: number = COLS): Mesh {
  const rng = createRng(seed);
  const viewW = getViewW(cols);
  const nodes: Array<readonly [number, number]> = [];
  for (let r = 0; r < ROWS; r++) {
    const stagger = r % 2 === 1 ? rng.between(10, 24) : 0;
    for (let c = 0; c < cols; c++) {
      const jx = rng.between(-8, 8);
      const jy = rng.between(-5, 5);
      nodes.push([36 + c * 96 + stagger + jx, 8 + r * 16 + jy]);
    }
  }
  const edges: Array<readonly [number, number]> = [];
  const at = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const i = at(r, c);
      if (c + 1 < cols) edges.push([i, at(r, c + 1)]);
      if (c + 2 < cols && c < cols - 3 && rng.roll(500)) edges.push([i, at(r, c + 2)]);
      if (r + 1 < ROWS && rng.roll(500)) edges.push([i, at(r + 1, c)]);
      if (r + 1 < ROWS && c + 1 < cols) edges.push([i, at(r + 1, c + 1)]);
      if (r > 0 && c + 1 < cols && rng.roll(330)) edges.push([i, at(r - 1, c + 1)]);
    }
  }
  // Parked outside the viewBox so synapses are cut at the chrome — the
  // mesh should read as continuing past the bar.
  const halo = (x: number, y: number, targets: number[]) => {
    const i = nodes.length;
    nodes.push([x, y]);
    for (const t of targets) edges.push([i, t]);
  };
  for (let c = 0; c < cols; c++) {
    const j = rng.between(-5, 5);
    halo(36 + c * 96 + j, -18 - rng.between(0, 5), [at(0, c), ...(c + 1 < cols ? [at(0, c + 1)] : [])]);
    halo(36 + c * 96 - j, VIEW_H + 18 + rng.between(0, 4), [at(ROWS - 1, c)]);
  }
  for (let r = 0; r < ROWS; r++) {
    halo(-32 - rng.between(0, 10), 8 + r * 16 + rng.between(-4, 4), [
      at(r, 0),
      ...(r + 1 < ROWS ? [at(r + 1, 0)] : []),
    ]);
  }
  const last = cols - 1;
  const sat = (x: number, y: number) => {
    nodes.push([clamp(x, viewW - 168, viewW - 72), clamp(y, 4, 60)]);
    return nodes.length - 1;
  };
  const p0 = sat(viewW - 154 + rng.between(-16, 16), 11 + rng.between(-4, 4));
  const p1 = sat(viewW - 106 + rng.between(-12, 12), 15 + rng.between(-4, 4));
  const p2 = sat(viewW - 132 + rng.between(-16, 16), 28 + rng.between(-5, 5));
  const p3 = sat(viewW - 90 + rng.between(-10, 10), 32 + rng.between(-5, 5));
  const p4 = sat(viewW - 158 + rng.between(-16, 16), 47 + rng.between(-4, 4));
  const p5 = sat(viewW - 110 + rng.between(-12, 12), 51 + rng.between(-4, 4));
  const pTop = sat(viewW - 78 + rng.between(-10, 8), 6 + rng.between(-2, 4));
  const pBot = sat(viewW - 82 + rng.between(-10, 8), 58 + rng.between(-4, 2));
  edges.push(
    [at(0, last), p0],
    [at(0, last), p1],
    [at(1, last), p2],
    [at(1, last), p3],
    [at(2, last), p2],
    [at(3, last), p4],
    [at(3, last), p5],
    [p0, p1],
    [p1, p3],
    [p1, pTop],
    [p2, p3],
    [p2, p5],
    [p4, p5],
    [p5, pBot],
    [p3, pTop],
    [p3, pBot],
  );
  if (rng.roll(500)) edges.push([p0, p2]);
  if (rng.roll(500)) edges.push([p4, p2]);
  // One synapse per pin, approaching from that side so traces do not
  // pile up through the die. Off-canvas sources keep the clipped-net read.
  halo(viewW * (0.76 + rng.between(0, 4) / 100), -20 - rng.between(0, 4), []);
  const topA = nodes.length - 1;
  halo(viewW * (0.84 + rng.between(0, 4) / 100), -18 - rng.between(0, 4), []);
  const topB = nodes.length - 1;
  halo(viewW * (0.92 + rng.between(0, 3) / 100), -20 - rng.between(0, 4), []);
  const topC = nodes.length - 1;
  halo(viewW * (0.76 + rng.between(0, 4) / 100), VIEW_H + 20 + rng.between(0, 4), []);
  const botA = nodes.length - 1;
  halo(viewW * (0.84 + rng.between(0, 4) / 100), VIEW_H + 18 + rng.between(0, 4), []);
  const botB = nodes.length - 1;
  halo(viewW * (0.92 + rng.between(0, 3) / 100), VIEW_H + 20 + rng.between(0, 4), []);
  const botC = nodes.length - 1;
  halo(viewW + 32 + rng.between(0, 12), VIEW_H * 0.26 + rng.between(-4, 4), []);
  const rightA = nodes.length - 1;
  halo(viewW + 36 + rng.between(0, 10), VIEW_H * 0.5 + rng.between(-4, 4), []);
  const rightB = nodes.length - 1;
  halo(viewW + 32 + rng.between(0, 12), VIEW_H * 0.74 + rng.between(-4, 4), []);
  const rightC = nodes.length - 1;
  const pinBase = nodes.length;
  const atPin = (p: number) => pinBase + p;
  edges.push(
    [topA, atPin(0)],
    [topB, atPin(1)],
    [topC, atPin(2)],
    [rightA, atPin(3)],
    [rightB, atPin(4)],
    [rightC, atPin(5)],
    [botA, atPin(6)],
    [botB, atPin(7)],
    [botC, atPin(8)],
    [p1, atPin(9)],
    [p3, atPin(10)],
    [p5, atPin(11)],
  );

  const adj: number[][] = Array.from({ length: pinBase + PIN_COUNT }, () => []);
  for (const [a, b] of edges) {
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  const edgeIndex = new Map<string, number>();
  edges.forEach(([a, b], i) => {
    edgeIndex.set(`${Math.min(a, b)}-${Math.max(a, b)}`, i);
  });
  return { nodes, edges, pinBase, adj, edgeIndex, cols, viewW };
}

export const SEED = (Math.random() * 0xffffffff) >>> 0;

export const MESH = createMesh(SEED, COLS);

export function isPin(node: number, mesh: Mesh = MESH): boolean {
  return node >= mesh.pinBase;
}

export function shortestPath(
  start: number,
  goal: number,
  mesh: Mesh = MESH,
  avoid?: Set<number>,
): number[] {
  const prev = new Map<number, number>();
  const seen = new Set([start]);
  const q = [start];
  while (q.length > 0) {
    const cur = q.shift()!;
    if (cur === goal) break;
    for (const n of mesh.adj[cur] ?? []) {
      if (seen.has(n) || (avoid?.has(n) && n !== goal)) continue;
      seen.add(n);
      prev.set(n, cur);
      q.push(n);
    }
  }
  if (!seen.has(goal)) {
    if (avoid && avoid.size > 0) {
      return shortestPath(start, goal, mesh);
    }
    return [start, goal];
  }
  const path = [goal];
  let cur: number | undefined = goal;
  while (cur !== start) {
    cur = prev.get(cur);
    if (cur === undefined) break;
    path.push(cur);
  }
  path.reverse();
  return path;
}

export type Spike = {
  neuronDelay: Map<number, number>;
  synapseDelay: Map<number, number>;
  chipDelay: number;
};

export function planSpike(seed: number, mesh: Mesh = MESH): Spike {
  const next = lcg(seed);
  const cols = mesh.cols;
  const grid = cols * ROWS;
  const start = next() % Math.floor((grid * 2) / 3);
  const path = shortestPath(start, mesh.pinBase + 10, mesh);
  const neuronDelay = new Map<number, number>();
  const synapseDelay = new Map<number, number>();
  const chipArrivals = [(path.length - 1) * STEP_MS];

  path.forEach((node, i) => {
    if (!isPin(node, mesh)) neuronDelay.set(node, i * STEP_MS);
    if (i === 0) return;
    const prev = path[i - 1]!;
    const edge = mesh.edgeIndex.get(`${Math.min(prev, node)}-${Math.max(prev, node)}`);
    if (edge !== undefined) synapseDelay.set(edge, (i - 1) * STEP_MS);
  });

  // Identify secondary (2nd) neurons branching off the primary path
  const secondNeurons: number[] = [];
  for (const node of path) {
    if (isPin(node, mesh)) continue;
    const parentDelay = neuronDelay.get(node) ?? 0;
    for (const n of mesh.adj[node] ?? []) {
      if (isPin(n, mesh) || neuronDelay.has(n)) continue;
      const pt = mesh.nodes[n];
      if (!pt || pt[0] < 0 || pt[0] > mesh.viewW || pt[1] < 0 || pt[1] > VIEW_H) continue;
      if (next() % 3 !== 0) continue;

      neuronDelay.set(n, parentDelay + STEP_MS);
      const edge = mesh.edgeIndex.get(`${Math.min(node, n)}-${Math.max(node, n)}`);
      if (edge !== undefined) {
        synapseDelay.set(edge, parentDelay);
      }
      secondNeurons.push(n);
      break; // At most one branch per primary node
    }
  }

  // Ensure at least one secondary branch if none were picked by RNG
  if (secondNeurons.length === 0 && path.length > 2) {
    const mid = path[Math.floor(path.length / 2)]!;
    const parentDelay = neuronDelay.get(mid) ?? 0;
    for (const n of mesh.adj[mid] ?? []) {
      if (isPin(n, mesh) || neuronDelay.has(n)) continue;
      const pt = mesh.nodes[n];
      if (!pt || pt[0] < 0 || pt[0] > mesh.viewW || pt[1] < 0 || pt[1] > VIEW_H) continue;
      neuronDelay.set(n, parentDelay + STEP_MS);
      const edge = mesh.edgeIndex.get(`${Math.min(mid, n)}-${Math.max(mid, n)}`);
      if (edge !== undefined) synapseDelay.set(edge, parentDelay);
      secondNeurons.push(n);
      break;
    }
  }

  // Now, each 2nd neuron either activates another neuron or travels to the AI chip
  const avoid = new Set<number>(path.filter((node) => !isPin(node, mesh)));
  const usedPins = new Set<number>();
  let chipBranches = 0;
  const MAX_CHIP_BRANCHES = 2;

  secondNeurons.forEach((n, idx) => {
    const nDelay = neuronDelay.get(n) ?? 0;
    const candidates = (mesh.adj[n] ?? []).filter((cand) => {
      if (isPin(cand, mesh) || neuronDelay.has(cand)) return false;
      const pt = mesh.nodes[cand];
      return pt && pt[0] >= 0 && pt[0] <= mesh.viewW && pt[1] >= 0 && pt[1] <= VIEW_H;
    });

    const canTravelToChip = chipBranches < MAX_CHIP_BRANCHES;
    // Prefer traveling to chip if no candidates to activate, or alternate/RNG when eligible
    const chooseChip = canTravelToChip && (candidates.length === 0 || chipBranches === 0 || idx % 2 === 0 || next() % 2 === 0);

    if (chooseChip) {
      // Option A: Travel to the AI chip
      const nodePt = mesh.nodes[n];
      const ny = nodePt ? nodePt[1] : VIEW_H / 2;
      const preferredPin = ny < VIEW_H / 2 ? mesh.pinBase + 9 : mesh.pinBase + 11;
      const alternatePin = preferredPin === mesh.pinBase + 9 ? mesh.pinBase + 11 : mesh.pinBase + 9;
      const targetPin = !usedPins.has(preferredPin)
        ? preferredPin
        : !usedPins.has(alternatePin)
          ? alternatePin
          : mesh.pinBase + 10;
      usedPins.add(targetPin);

      const branchPath = shortestPath(n, targetPin, mesh, avoid);
      if (branchPath.length >= 2) {
        chipBranches++;
        const startDelay = nDelay;
        for (let b = 1; b < branchPath.length; b++) {
          const prevNode = branchPath[b - 1]!;
          const currNode = branchPath[b]!;
          const edge = mesh.edgeIndex.get(`${Math.min(prevNode, currNode)}-${Math.max(prevNode, currNode)}`);
          const stepSynapseDelay = startDelay + (b - 1) * STEP_MS;
          if (edge !== undefined && !synapseDelay.has(edge)) {
            synapseDelay.set(edge, stepSynapseDelay);
          }
          if (!isPin(currNode, mesh)) {
            avoid.add(currNode);
            if (!neuronDelay.has(currNode)) {
              neuronDelay.set(currNode, startDelay + b * STEP_MS);
            }
          } else {
            chipArrivals.push(startDelay + b * STEP_MS);
          }
        }
      }
    } else if (candidates.length > 0) {
      // Option B: Activate another neuron (and optionally 1 more downstream)
      const nx = mesh.nodes[n]?.[0] ?? 0;
      const fwd = candidates.filter((c) => (mesh.nodes[c]?.[0] ?? 0) >= nx - 8);
      const pool = fwd.length > 0 ? fwd : candidates;
      const n2 = pool[next() % pool.length]!;
      const edge = mesh.edgeIndex.get(`${Math.min(n, n2)}-${Math.max(n, n2)}`);
      if (edge !== undefined && !synapseDelay.has(edge)) {
        synapseDelay.set(edge, nDelay);
      }
      const delay2 = nDelay + STEP_MS;
      neuronDelay.set(n2, delay2);
      avoid.add(n2);

      // Optionally extend 1 hop further to a 3rd neuron
      if (next() % 2 === 0) {
        const n2x = mesh.nodes[n2]?.[0] ?? 0;
        const candidates3 = (mesh.adj[n2] ?? []).filter((cand) => {
          if (isPin(cand, mesh) || neuronDelay.has(cand)) return false;
          const pt = mesh.nodes[cand];
          return pt && pt[0] >= 0 && pt[0] <= mesh.viewW && pt[1] >= 0 && pt[1] <= VIEW_H;
        });
        const fwd3 = candidates3.filter((c) => (mesh.nodes[c]?.[0] ?? 0) >= n2x - 8);
        const pool3 = fwd3.length > 0 ? fwd3 : candidates3;
        if (pool3.length > 0) {
          const n3 = pool3[next() % pool3.length]!;
          const edge3 = mesh.edgeIndex.get(`${Math.min(n2, n3)}-${Math.max(n2, n3)}`);
          if (edge3 !== undefined && !synapseDelay.has(edge3)) {
            synapseDelay.set(edge3, delay2);
          }
          neuronDelay.set(n3, delay2 + STEP_MS);
          avoid.add(n3);
        }
      }
    }
  });

  return {
    neuronDelay,
    synapseDelay,
    chipDelay: Math.min(...chipArrivals),
  };
}
