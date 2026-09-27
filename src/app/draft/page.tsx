import Link from 'next/link';

// S51 has no draft. The S50 live-draft page was retired with the move to
// weekly pick cards; its history remains in git.
export default function DraftPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0a0f' }}>
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">📋</div>
        <h1 className="text-lg font-bold text-white mb-2">No draft this season</h1>
        <p className="text-sm text-white/50 mb-4">Every week you fill a fresh pick card instead of keeping a roster.</p>
        <Link href="/picks" className="text-sm text-[#3fc0f0] underline">Go to your pick card →</Link>
      </div>
    </div>
  );
}
