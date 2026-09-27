'use client';

// ============================================================
// Lightweight SVG charts (no chart library). Follows the dataviz rules:
// thin marks, 4px rounded data-ends, hairline grid, one highlighted series
// (--c-chart-hi) over de-emphasised context (--c-chart-ctx), text in text
// tokens only, and a hover/focus tooltip on every chart.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { formatRank } from '@/lib/utils';

const HI = 'rgb(var(--c-chart-hi))';
const CTX = 'rgb(var(--c-chart-ctx))';
const GRID = 'rgb(var(--c-line))';
const SURFACE = 'rgb(var(--c-surface))';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function Tooltip({ x, y, width, children, side = false }: { x: number; y: number; width: number; children: React.ReactNode; side?: boolean }) {
  // side: sit beside the crosshair (inside the plot) instead of above the mark
  const left = side
    ? (x > width / 2 ? Math.max(x - 152, 0) : Math.min(x + 12, Math.max(width - 140, 0)))
    : Math.min(Math.max(x - 70, 0), Math.max(width - 140, 0));
  return (
    <div className="pointer-events-none absolute z-10 w-[140px] rounded-lg border border-line bg-surface px-2.5 py-2 text-xs shadow-pop"
      style={side ? { left, top: y } : { left, top: Math.max(y - 8, 0), transform: 'translateY(-100%)' }}>
      {children}
    </div>
  );
}

// ---- Card points per episode (columns) + optional league-average marker ------------
export function EpisodeBars({ data, reference, height = 180, valueLabel = 'pts', seriesLabel = 'Card total', referenceLabel = 'League average' }: {
  data: { episode: number; value: number; href?: string }[];
  reference?: Record<number, number>;
  height?: number;
  valueLabel?: string;
  seriesLabel?: string;
  referenceLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div ref={ref} className="text-sm text-muted">No data yet.</div>;

  const padL = 28, padR = 8, padT = 12, padB = 22;
  const plotW = Math.max(width - padL - padR, 10), plotH = height - padT - padB;
  const vals = data.map(d => d.value).concat(reference ? data.map(d => reference[d.episode] ?? 0) : []);
  const max = niceMax(Math.max(1, ...vals));
  const min = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(0, ...vals)) : 0;
  const y = (v: number) => padT + ((max - v) / (max - min)) * plotH;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);
  const r = 4;

  const bar = (cx: number, v: number) => {
    const y0 = y(0), y1 = y(v);
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return null;
    const x0 = cx - barW / 2;
    const rr = Math.min(r, h);
    // Rounded at the data end, square at the baseline
    return v >= 0
      ? `M${x0},${y0} V${y1 + rr} Q${x0},${y1} ${x0 + rr},${y1} H${x0 + barW - rr} Q${x0 + barW},${y1} ${x0 + barW},${y1 + rr} V${y0} Z`
      : `M${x0},${y0} V${y1 - rr} Q${x0},${y1} ${x0 + rr},${y1} H${x0 + barW - rr} Q${x0 + barW},${y1} ${x0 + barW},${y1 - rr} V${y0} Z`;
  };

  const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max];
  const h = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative">
      {reference && (
        <div className="flex items-center gap-4 text-xs text-muted mb-2">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: HI }} />{seriesLabel}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: 'rgb(var(--c-ink))' }} />{referenceLabel}</span>
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${seriesLabel} by episode`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-faint num" fontSize={10}>{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + band * i + band / 2;
            const path = bar(cx, d.value);
            const refV = reference?.[d.episode];
            return (
              <g key={d.episode}>
                {path && <path d={path} fill={d.value < 0 ? 'rgb(var(--c-negative))' : HI} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {refV !== undefined && <line x1={cx - barW / 2 - 4} x2={cx + barW / 2 + 4} y1={y(refV)} y2={y(refV)} stroke="rgb(var(--c-ink))" strokeWidth={2} strokeLinecap="round" />}
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-faint" fontSize={10}>E{d.episode}</text>
                {/* hit target: the whole band */}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" tabIndex={0}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  onClick={() => d.href && (window.location.href = d.href)} style={{ cursor: d.href ? 'pointer' : 'default', outline: 'none' }} />
              </g>
            );
          })}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={padL + band * hover + band / 2} y={y(Math.max(h.value, reference?.[h.episode] ?? 0))} width={width}>
          <div className="text-muted mb-0.5">Episode {h.episode}</div>
          <div className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: HI }} /><b className="text-ink num">{h.value}</b><span className="text-muted">{valueLabel}</span></div>
          {reference?.[h.episode] !== undefined && <div className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: 'rgb(var(--c-ink))' }} /><b className="text-ink num">{reference[h.episode]}</b><span className="text-muted">avg</span></div>}
        </Tooltip>
      )}
    </div>
  );
}

// ---- Rank over time (one highlighted manager over the field) -------------------------
export function RankLines({ series, highlightId, episodes, total, height = 220, xLabel = (e: number) => `E${e}`, tooltipTitle = (e: number) => `After episode ${e}`, highlightLabel = 'You' }: {
  series: { id: string; name: string; points: { episode: number; rank: number }[] }[];
  highlightId?: string | null;
  episodes: number[];          // x positions (episode numbers, or any ordered keys)
  total: number;
  height?: number;
  xLabel?: (x: number) => string;
  tooltipTitle?: (x: number) => string;
  highlightLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!episodes.length) return <div ref={ref} className="text-sm text-muted">No episodes scored yet.</div>;

  const padL = 30, padR = 64, padT = 10, padB = 22;
  const plotW = Math.max(width - padL - padR, 10), plotH = height - padT - padB;
  const x = (i: number) => padL + (episodes.length === 1 ? plotW / 2 : (i / (episodes.length - 1)) * plotW);
  const y = (rank: number) => padT + ((rank - 1) / Math.max(total - 1, 1)) * plotH;
  const idx = new Map(episodes.map((e, i) => [e, i]));
  const path = (pts: { episode: number; rank: number }[]) => pts.filter(p => idx.has(p.episode)).map((p, i) => `${i ? 'L' : 'M'}${x(idx.get(p.episode)!)},${y(p.rank)}`).join(' ');
  const hi = series.find(s => s.id === highlightId);
  const others = series.filter(s => s.id !== highlightId);
  const last = hi?.points[hi.points.length - 1];

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = episodes.length === 1 ? 0 : Math.round((px / rect.width) * (episodes.length - 1));
    setHover(Math.max(0, Math.min(episodes.length - 1, i)));
  };
  const hoverRows = hover !== null
    ? series.map(s => ({ s, rank: s.points.find(p => p.episode === episodes[hover])?.rank })).filter(r => r.rank).sort((a, b) => a.rank! - b.rank!)
    : [];

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Head-to-head rank after each episode">
          {[1, Math.ceil(total / 2), total].map(rk => (
            <g key={rk}>
              <line x1={padL} x2={padL + plotW} y1={y(rk)} y2={y(rk)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 8} y={y(rk) + 3.5} textAnchor="end" className="fill-faint num" fontSize={10}>{formatRank(rk)}</text>
            </g>
          ))}
          {episodes.map((ep, i) => <text key={ep} x={x(i)} y={height - 6} textAnchor="middle" className="fill-faint" fontSize={10}>{xLabel(ep)}</text>)}
          {others.map(s => episodes.length > 1
            ? <path key={s.id} d={path(s.points)} fill="none" stroke={CTX} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            : s.points.map(p => <circle key={s.id} cx={x(0)} cy={y(p.rank)} r={3} fill={CTX} />))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="rgb(var(--c-faint))" strokeWidth={1} />}
          {hi && (
            <>
              {episodes.length > 1 && <path d={path(hi.points)} fill="none" stroke={HI} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
              {last && <circle cx={x(idx.get(last.episode)!)} cy={y(last.rank)} r={4.5} fill={HI} stroke={SURFACE} strokeWidth={2} />}
              {last && <text x={x(idx.get(last.episode)!) + 9} y={y(last.rank) + 4} className="fill-ink" fontSize={11} fontWeight={600}>{highlightLabel} · {formatRank(last.rank)}</text>}
            </>
          )}
          <rect x={padL - 10} y={padT} width={plotW + 20} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && hoverRows.length > 0 && (
        <Tooltip x={x(hover)} y={0} width={width} side>
          <div className="text-muted mb-1">{tooltipTitle(episodes[hover])}</div>
          <div className="space-y-0.5">
            {hoverRows.map(r => (
              <div key={r.s.id} className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded" style={{ background: r.s.id === highlightId ? HI : CTX }} />
                <b className="text-ink num w-8">{formatRank(r.rank!)}</b>
                <span className={r.s.id === highlightId ? 'text-ink font-semibold' : 'text-muted'}>{r.s.name}</span>
              </div>
            ))}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// ---- Tiny form strip for tables ---------------------------------------------------
export function Sparkline({ values, width = 64, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => max === min ? height / 2 : height - 2 - ((v - min) / (max - min)) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={CTX} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={HI} />
    </svg>
  );
}
