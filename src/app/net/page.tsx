import Link from 'next/link';

// NET (Name the Episode Title) is the Title slot on the S51 pick card.
export default function NetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0a0f' }}>
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">💬</div>
        <h1 className="text-lg font-bold text-white mb-2">NET is now the Title slot</h1>
        <p className="text-sm text-white/50 mb-4">Pick who says the episode title on your weekly pick card. It&apos;s worth +1, and Jeff is an option.</p>
        <Link href="/picks" className="text-sm text-[#3fc0f0] underline">Go to your pick card →</Link>
      </div>
    </div>
  );
}
