import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  CHIP_BODY,
  CHIP_CX,
  CHIP_CY,
  CHIP_HALF,
  CHIP_PIN,
  CHIP_PIN_GAP,
  CHIP_PX,
  CHIP_RIGHT,
  CHIP_VB,
  COLS,
  createMesh,
  FIRE,
  FIRE_MS,
  getColsForWidth,
  getViewW,
  IDLE,
  isPin,
  MESH,
  PIN_TIPS,
  planSpike,
  SEED,
  VIEW_H,
  VIEW_W,
} from "./mastheadMotifMesh";

/**
 * Header constellation. Idle grey; on a click or route change a spike starts
 * at a random neuron and travels right, synapse by synapse, into the chip.
 * The mesh fills the bar according to the viewport width; the chip is a
 * second, unstretched drawing so it stays square.
 */

const MOTIF_CSS = `
@keyframes sac-neuron-fire {
  0% { fill: ${IDLE}; opacity: 0.45; transform: scale(1); }
  18% { fill: ${FIRE}; opacity: 1; transform: scale(2.4); }
  100% { fill: ${IDLE}; opacity: 0.45; transform: scale(1); }
}
@keyframes sac-synapse-fire {
  0% { stroke: ${IDLE}; stroke-opacity: 0.35; stroke-width: 0.6; }
  18% { stroke: ${FIRE}; stroke-opacity: 0.95; stroke-width: 1.15; }
  100% { stroke: ${IDLE}; stroke-opacity: 0.35; stroke-width: 0.6; }
}
@keyframes sac-chip-fire {
  0% { stroke: ${IDLE}; }
  18% { stroke: ${FIRE}; }
  100% { stroke: ${IDLE}; }
}
.sac-neuron {
  transform-box: fill-box;
  transform-origin: center;
}
.sac-neuron.is-firing { animation: sac-neuron-fire ${FIRE_MS}ms ease-out both; }
.sac-synapse.is-firing { animation: sac-synapse-fire ${FIRE_MS}ms ease-out both; }
.sac-chip.is-firing { animation: sac-chip-fire ${FIRE_MS}ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .sac-neuron.is-firing, .sac-synapse.is-firing, .sac-chip.is-firing {
    animation: none;
    fill: ${FIRE};
    stroke: ${FIRE};
  }
}
`;

export function MastheadMotif() {
  const { pathname } = useLocation();
  const [burst, setBurst] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : VIEW_W,
    h: VIEW_H,
  }));
  const cols = getColsForWidth(frame.w);
  const mesh = useMemo(() => (cols === COLS ? MESH : createMesh(SEED, cols)), [cols]);
  const viewW = mesh.viewW ?? getViewW(cols);
  const fire = useCallback(() => {
    setBurst((n) => n + 1);
  }, []);

  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      queueMicrotask(fire);
    }
  }, [pathname, fire]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("a")) return;
      if (target.closest("button, [role='button'], [role='switch'], [role='menuitem']")) {
        fire();
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [fire]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setFrame({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spike = useMemo(
    () => (burst === 0 ? undefined : planSpike(burst, mesh)),
    [burst, mesh],
  );

  const pinInViewBox = (tip: readonly [number, number]): [number, number] => {
    const scale = CHIP_PX / CHIP_VB;
    const hx = frame.w - CHIP_RIGHT - CHIP_PX + tip[0] * scale;
    const hy = (frame.h - CHIP_PX) / 2 + tip[1] * scale;
    return [(hx / frame.w) * viewW, (hy / frame.h) * VIEW_H];
  };

  const point = (node: number): readonly [number, number] => {
    if (isPin(node, mesh)) return pinInViewBox(PIN_TIPS[node - mesh.pinBase]!);
    return mesh.nodes[node]!;
  };

  return (
    <div
      ref={wrapRef}
      aria-hidden
      data-motif="agentic-ai"
      data-burst={burst}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <style>{MOTIF_CSS}</style>
      <svg
        viewBox={`0 0 ${viewW} ${VIEW_H}`}
        preserveAspectRatio="none"
        focusable="false"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          // Sit behind the chrome: faint and slightly defocused so nav
          // type stays the foreground. The chip is a separate SVG so it
          // stays sharp.
          opacity: 0.4,
          // filter: "blur(1.1px)",
        }}
      >
        <g
          fill="none"
          stroke={IDLE}
          strokeWidth="0.6"
          strokeOpacity="0.45"
          strokeLinecap="round"
        >
          {mesh.edges.map(([a, b], i) => {
            const [x1, y1] = point(a);
            const [x2, y2] = point(b);
            const delay = spike?.synapseDelay.get(i);
            return (
              <line
                key={`${burst}-${a}-${b}`}
                className={delay === undefined ? "sac-synapse" : "sac-synapse is-firing"}
                style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}
                vectorEffect="non-scaling-stroke"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              />
            );
          })}
        </g>
        <g fill={IDLE} opacity="0.5">
          {mesh.nodes.map(([x, y], i) => {
            if (x < 0 || x > viewW || y < 0 || y > VIEW_H) return null;
            const delay = spike?.neuronDelay.get(i);
            return (
              <circle
                key={`${burst}-${i}`}
                className={delay === undefined ? "sac-neuron" : "sac-neuron is-firing"}
                style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}
                cx={x}
                cy={y}
                r={i % 5 === 0 ? 2.1 : 1.45}
              />
            );
          })}
        </g>
      </svg>
      <AiChip burst={burst} delay={spike?.chipDelay ?? 0} />
    </div>
  );
}

function AiChip({ burst, delay }: { burst: number; delay: number }) {
  const half = CHIP_HALF;
  const pin = CHIP_PIN;
  const pinGap = CHIP_PIN_GAP;
  const body = CHIP_BODY;
  const inner = 14;
  const cx = CHIP_CX;
  const cy = CHIP_CY;

  return (
    <svg
      viewBox={`0 0 ${CHIP_VB} ${CHIP_VB}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
      data-chip="ai"
      style={{
        position: "absolute",
        right: CHIP_RIGHT,
        top: "50%",
        width: CHIP_PX,
        height: CHIP_PX,
        marginTop: -CHIP_PX / 2,
        display: "block",
        opacity: 0.55,
      }}
    >
      <g
        key={burst}
        className={burst > 0 ? "sac-chip is-firing" : "sac-chip"}
        style={burst > 0 ? { animationDelay: `${delay}ms` } : undefined}
        fill="none"
        stroke={IDLE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x={cx - half} y={cy - half} width={body} height={body} rx="3" />
        <rect x={cx - inner / 2} y={cy - inner / 2} width={inner} height={inner} rx="1.5" />
        {([-pinGap, 0, pinGap] as const).map((offset) => (
          <g key={offset}>
            <line x1={cx + offset} y1={cy - half} x2={cx + offset} y2={cy - half - pin} />
            <line x1={cx + offset} y1={cy + half} x2={cx + offset} y2={cy + half + pin} />
            <line x1={cx - half} y1={cy + offset} x2={cx - half - pin} y2={cy + offset} />
            <line x1={cx + half} y1={cy + offset} x2={cx + half + pin} y2={cy + offset} />
          </g>
        ))}
        <g fill={IDLE} stroke="none">
          <circle cx={cx - half} cy={cy - half} r="2.2" />
          <circle cx={cx + half} cy={cy - half} r="2.2" />
          <circle cx={cx - half} cy={cy + half} r="2.2" />
          <circle cx={cx + half} cy={cy + half} r="2.2" />
        </g>
      </g>
    </svg>
  );
}
