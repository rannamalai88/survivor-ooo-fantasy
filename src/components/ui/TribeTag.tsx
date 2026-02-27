import { getTribeColor } from '@/lib/utils';

interface TribeTagProps {
  tribe: string;
  size?: 'sm' | 'md';
}

export default function TribeTag({ tribe, size = 'sm' }: TribeTagProps) {
  const color = getTribeColor(tribe);
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wider rounded ${
        isSmall ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'
      }`}
      style={{
        background: `${color}15`,
        color: color,
      }}
    >
      {tribe}
    </span>
  );
}
