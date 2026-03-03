'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const COMMISSIONER_PIN = '120888';

export default function LoginPage() {
  const { manager, managers, isLoading, login } = useAuth();
  const router = useRouter();
  const [pinPrompt, setPinPrompt] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (manager) router.push('/');
  }, [manager, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-white/30 text-sm font-medium tracking-wider uppercase">Loading...</div>
      </div>
    );
  }

  if (manager) return null;

  const handleSelect = (name: string, isCommish: boolean) => {
    if (isCommish) {
      setPinPrompt(name);
      setPinInput('');
      setPinError(false);
    } else {
      login(name);
      router.push('/');
    }
  };

  const handlePinSubmit = () => {
    if (pinInput === COMMISSIONER_PIN) {
      login(pinPrompt!);
      router.push('/');
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0a0f' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🔥</div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mb-1">
            Survivor OOO <span style={{ color: '#FF6B35' }}>Fantasy</span>
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Season 50</p>
        </div>

        {pinPrompt ? (
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-3"
                style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD54F', border: '2px solid rgba(255,215,0,0.3)' }}>
                {pinPrompt[0]}
              </div>
              <div className="text-sm font-semibold text-white">{pinPrompt}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: '#FFD54F' }}>Commissioner</div>
            </div>
            <p className="text-xs text-center mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Enter your PIN to sign in</p>
            <div className="flex gap-2 mb-3">
              <input type="password" value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
                placeholder="Enter PIN" autoFocus
                className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-white/20 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: pinError ? '1px solid rgba(255,80,80,0.5)' : '1px solid rgba(255,255,255,0.1)' }} />
              <button onClick={handlePinSubmit} className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{ background: 'rgba(255,107,53,0.15)', color: '#FF6B35', border: '1px solid rgba(255,107,53,0.3)' }}>Go</button>
            </div>
            {pinError && <p className="text-xs text-center" style={{ color: '#FF5050' }}>Incorrect PIN. Try again.</p>}
            <button onClick={() => { setPinPrompt(null); setPinInput(''); setPinError(false); }}
              className="w-full text-center text-xs mt-3 py-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Back</button>
          </div>
        ) : (
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Sign in as...</h2>
            <div className="grid grid-cols-2 gap-2">
              {managers.map((m) => (
                <button key={m.id} onClick={() => handleSelect(m.name, m.is_commissioner)}
                  className="text-left px-4 py-3 rounded-xl transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: m.is_commissioner ? 'rgba(255,215,0,0.12)' : 'rgba(255,107,53,0.12)', color: m.is_commissioner ? '#FFD54F' : '#FF6B35' }}>
                      {m.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{m.name}</div>
                      {m.is_commissioner && (
                        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#FFD54F' }}>Commissioner</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>Private league only</p>
      </div>
    </div>
  );
}
