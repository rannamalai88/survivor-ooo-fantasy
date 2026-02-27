import { STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: 'active' | 'drowned' | 'burnt' | 'finished';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] || '#666';

  return (
    <span
      className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{
        background: `${color}15`,
        color: color,
      }}
    >
      {status}
    </span>
  );
}
