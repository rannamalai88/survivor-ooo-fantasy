'use client';

import { useAuth } from '@/context/AuthContext';
import { useSeason } from '@/hooks/useSeason';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, Button, Badge, ManagerAvatar, cn } from '@/components/ui';

export default function LoginPage() {
  const { manager, managers, isLoading, login } = useAuth();
  const { season } = useSeason();
  const router = useRouter();
  const [pinPrompt, setPinPrompt] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);

  useEffect(() => {
    if (manager) router.push('/');
  }, [manager, router]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="skeleton h-10 w-40" /></div>;

  if (manager) return null;

  const handleSelect = (name: string, isCommish: boolean) => {
    if (isCommish) {
      setPinPrompt(name);
      setPinInput('');
      setPinError(null);
    } else {
      login(name);
      router.push('/');
    }
  };

  const handlePinSubmit = async () => {
    if (pinChecking || !pinInput) return;
    setPinChecking(true);
    try {
      const res = await fetch('/api/auth/commissioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        login(pinPrompt!);
        router.push('/');
        return;
      }
      setPinError(res.status === 401 ? 'Incorrect PIN. Try again.' : `Could not check PIN${data.error ? `: ${data.error}` : ''}.`);
      setPinInput('');
    } catch {
      setPinError('Could not reach the server. Try again.');
    } finally {
      setPinChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-accent/10 via-canvas to-canvas">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔥</div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Survivor OOO Fantasy</h1>
          <p className="text-sm text-muted mt-1">{season?.name ?? 'Survivor'} · Outwit. Outpick. Outlast.</p>
        </div>

        {pinPrompt ? (
          <Card className="p-6">
            <div className="text-center mb-5">
              <ManagerAvatar name={pinPrompt} size={52} me className="mx-auto mb-3" />
              <div className="font-semibold text-ink">{pinPrompt}</div>
              <Badge tone="accent" className="mt-1">Commissioner</Badge>
            </div>
            <label htmlFor="pin" className="block text-sm text-muted text-center mb-3">Enter your PIN to sign in</label>
            <div className="flex gap-2">
              <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
                placeholder="PIN" autoFocus
                className={cn('flex-1 h-11 rounded-xl bg-raised px-3 text-ink placeholder:text-faint border outline-none focus:border-accent', pinError ? 'border-negative' : 'border-line')} />
              <Button onClick={handlePinSubmit} disabled={pinChecking || !pinInput} size="lg">{pinChecking ? '…' : 'Sign in'}</Button>
            </div>
            {pinError && <p className="text-sm text-negative text-center mt-3">{pinError}</p>}
            <button onClick={() => { setPinPrompt(null); setPinInput(''); setPinError(null); }} className="w-full text-center text-sm text-muted hover:text-ink mt-4">Back</button>
          </Card>
        ) : (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-muted mb-3">Who&apos;s playing?</h2>
            <div className="grid grid-cols-2 gap-2">
              {managers.map((m) => (
                <button key={m.id} onClick={() => handleSelect(m.name, m.is_commissioner)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-raised/40 px-3 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5">
                  <ManagerAvatar name={m.name} size={34} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{m.name}</div>
                    {m.is_commissioner && <div className="text-[11px] font-medium text-accent">Commissioner</div>}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
        <p className="text-center mt-6 text-xs text-faint">Private league · 12 managers · 6 couples</p>
      </div>
    </div>
  );
}
