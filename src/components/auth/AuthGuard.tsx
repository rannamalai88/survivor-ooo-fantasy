'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { manager, isLoading, isCommissioner } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !manager) router.push('/login');
    if (!isLoading && requireAdmin && !isCommissioner) router.push('/');
  }, [manager, isLoading, isCommissioner, requireAdmin, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-white/30 text-sm font-medium tracking-wider uppercase">Loading...</div>
      </div>
    );
  }

  if (!manager) return null;
  if (requireAdmin && !isCommissioner) return null;

  return <>{children}</>;
}
