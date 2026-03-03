'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function UserBadge() {
  const { manager, isCommissioner, logout } = useAuth();
  const router = useRouter();
  if (!manager) return null;
  const handleLogout = () => { logout(); router.push('/login'); };
  const bg = isCommissioner ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.06)';
  const bd = isCommissioner ? '1px solid rgba(255,215,0,0.25)' : '1px solid rgba(255,255,255,0.1)';
  const cl = isCommissioner ? '#FFD54F' : 'rgba(255,255,255,0.6)';
  const ibg = isCommissioner ? 'rgba(255,215,0,0.2)' : 'rgba(255,107,53,0.15)';
  const icl = isCommissioner ? '#FFD54F' : '#FF6B35';
  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600, background: bg, border: bd, color: cl, backdropFilter: 'blur(12px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, background: ibg, color: icl }}>
          {manager.name[0]}
        </div>
        <span>{manager.name}</span>
        {isCommissioner && <span style={{ fontSize: '9px', opacity: 0.6 }}>ADMIN</span>}
        <button onClick={handleLogout} title="Log out" style={{ marginLeft: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', background: 'rgba(255,80,80,0.1)', color: 'rgba(255,80,80,0.6)', border: '1px solid rgba(255,80,80,0.15)' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
