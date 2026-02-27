interface RankBadgeProps {
  rank: number;
  size?: 'sm' | 'md' | 'lg';
}

const RANK_STYLES: Record<number, { emoji: string; color: string; bg: string }> = {
  1: { emoji: '🥇', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.1)' },
  2: { emoji: '🥈', color: '#C0C0C0', bg: 'rgba(192, 192, 192, 0.1)' },
  3: { emoji: '🥉', color: '#CD7F32', bg: 'rgba(205, 127, 50, 0.1)' },
};

export default function RankBadge({ rank, size = 'md' }: RankBadgeProps) {
  const style = RANK_STYLES[rank];

  if (!style) {
    return (
      <span className="text-white/30 font-bold text-sm">
        {rank}
      </span>
    );
  }

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <span className={sizeClasses[size]}>
      {style.emoji}
    </span>
  );
}
