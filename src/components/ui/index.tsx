'use client';

// ============================================================
// Shared UI primitives. Built on the theme tokens (globals.css /
// tailwind.config.js), so everything works in light and dark mode.
// ============================================================

import Link from 'next/link';
import { TRIBE_COLORS } from '@/lib/constants';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---- Tribe colour (identity only) -------------------------------------------
/** CSS colour for a tribe. S51 tribes follow the theme; older tribes use fixed hex. */
export function tribeColor(tribe: string | null | undefined): string {
  if (tribe === 'Savu') return 'rgb(var(--c-savu))';
  if (tribe === 'Toka') return 'rgb(var(--c-toka))';
  return (tribe && TRIBE_COLORS[tribe]) || 'rgb(var(--c-faint))';
}
/** Text colour that reads on a solid tribe fill. */
export function tribeOnColor(tribe: string | null | undefined): string {
  if (tribe === 'Toka') return 'rgb(var(--c-toka-on))';
  return '#fff';
}

// ---- Layout --------------------------------------------------------------------
export function Page({ children, width = 'md', className }: { children: React.ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const w = { sm: 'max-w-xl', md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-6xl' }[width];
  return <div className={cn('mx-auto px-4 pt-5 pb-10 md:pt-8', w, className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs font-semibold text-muted mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, padded = true, as: As = 'div', ...rest }: { children: React.ReactNode; className?: string; padded?: boolean; as?: any } & React.HTMLAttributes<HTMLDivElement>) {
  return <As className={cn('rounded-2xl bg-surface border border-line shadow-card', padded && 'p-4 sm:p-5', className)} {...rest}>{children}</As>;
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </div>
  );
}

// ---- Controls --------------------------------------------------------------------
type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warn' | 'savu' | 'toka';
const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted',
  accent: 'bg-accent/10 text-accent',
  positive: 'bg-positive/10 text-positive',
  negative: 'bg-negative/10 text-negative',
  warn: 'bg-warn/10 text-warn',
  savu: 'bg-savu text-savu-on',
  toka: 'bg-toka text-toka-on',
};

export function Badge({ children, tone = 'neutral', className, title }: { children: React.ReactNode; tone?: Tone; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 shadow-card',
  secondary: 'bg-raised text-ink border border-line hover:bg-line/60',
  ghost: 'text-accent hover:bg-accent/10',
  danger: 'bg-negative text-white hover:brightness-110',
};

export function Button({ children, variant = 'primary', size = 'md', href, onClick, disabled, className, type = 'button', title }: {
  children: React.ReactNode; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; href?: string; onClick?: () => void;
  disabled?: boolean; className?: string; type?: 'button' | 'submit'; title?: string;
}) {
  const sz = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-[15px]' }[size];
  const cls = cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[filter,background-color] disabled:opacity-45 disabled:pointer-events-none', sz, BTN[variant], className);
  if (href) return <Link href={href} className={cls} title={title}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls} title={title}>{children}</button>;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full overflow-x-auto rounded-xl bg-raised p-1 gap-1', className)}>
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 px-3 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- People ----------------------------------------------------------------------
export function SurvivorAvatar({ name, tribe, photoUrl, size = 32, out = false, className }: { name: string; tribe: string | null; photoUrl?: string | null; size?: number; out?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised', className)}
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${tribeColor(tribe)}`, opacity: out ? 0.5 : 1, filter: out ? 'grayscale(1)' : undefined }}>
      {photoUrl
        ? <img src={photoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : <span className="font-bold text-muted" style={{ fontSize: size * 0.4 }}>{name.replace(/["']/g, '')[0]}</span>}
    </span>
  );
}

export function ManagerAvatar({ name, size = 32, me = false, className }: { name: string; size?: number; me?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', me ? 'bg-accent text-on-accent' : 'bg-raised text-muted', className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name[0]}
    </span>
  );
}

/** Tribe name with a colour dot. The text stays in ink; the dot carries identity. */
export function TribeTag({ tribe, className }: { tribe: string | null; className?: string }) {
  if (!tribe) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium text-muted', className)}>
      <span className="h-2 w-2 rounded-full" style={{ background: tribeColor(tribe) }} />{tribe}
    </span>
  );
}

// ---- Figures ---------------------------------------------------------------------
export function StatTile({ label, value, sub, className, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="text-2xl font-bold tracking-tight text-ink mt-0.5">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </>
  );
  const cls = cn('rounded-xl bg-raised/60 px-3 py-2.5', href && 'hover:bg-raised transition-colors', className);
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function ResultPill({ result }: { result: 'W' | 'D' | 'L' }) {
  const tone = result === 'W' ? 'bg-positive/15 text-positive' : result === 'L' ? 'bg-negative/15 text-negative' : 'bg-raised text-muted';
  return <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold', tone)}>{result}</span>;
}

/** Signed points, coloured by sign. */
export function Points({ value, signed = false, className }: { value: number; signed?: boolean; className?: string }) {
  const color = value < 0 ? 'text-negative' : value > 0 ? 'text-ink' : 'text-faint';
  return <span className={cn('num font-semibold', color, className)}>{signed && value > 0 ? '+' : ''}{value}</span>;
}

// ---- States ----------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function PageSkeleton() {
  return (
    <Page>
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-72 mb-6" />
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </Page>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-3xl mb-2">{icon}</div>}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ tone = 'accent', children, className }: { tone?: 'accent' | 'positive' | 'negative' | 'warn'; children: React.ReactNode; className?: string }) {
  const t = { accent: 'bg-accent/10 text-ink border-accent/30', positive: 'bg-positive/10 text-ink border-positive/30', negative: 'bg-negative/10 text-ink border-negative/30', warn: 'bg-warn/10 text-ink border-warn/30' }[tone];
  return <div className={cn('rounded-xl border px-3.5 py-2.5 text-sm', t, className)}>{children}</div>;
}
