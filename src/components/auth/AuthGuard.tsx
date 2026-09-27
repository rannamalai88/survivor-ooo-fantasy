'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageSkeleton } from '@/components/ui';

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

  if (isLoading) return <PageSkeleton />;

  if (!manager) return null;
  if (requireAdmin && !isCommissioner) return null;

  return <>{children}</>;
}
