'use client';

import { getTribeColor, getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  tribe: string;
  photoUrl?: string | null;
  size?: number;
  showBorder?: boolean;
}

export default function Avatar({ name, tribe, photoUrl, size = 32, showBorder = true }: AvatarProps) {
  const tribeColor = getTribeColor(tribe);
  const initials = getInitials(name);

  return (
    <div
      className="relative rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: photoUrl ? 'transparent' : `${tribeColor}22`,
        border: showBorder ? `2px solid ${tribeColor}` : 'none',
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials on image load error
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold ${photoUrl ? 'hidden' : ''}`}
        style={{
          fontSize: size * 0.4,
          color: tribeColor,
        }}
      >
        {initials}
      </span>
    </div>
  );
}
