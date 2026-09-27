'use client';

// /recap → the latest scored episode's recap.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSeasonContext } from '@/lib/season-context';
import { Page, EmptyState, PageSkeleton } from '@/components/ui';

export default function RecapIndex() {
  const router = useRouter();
  const { episodes, loading } = useSeasonContext();
  const latest = [...episodes].reverse().find(e => e.status === 'scored');
  useEffect(() => { if (latest) router.replace(`/recap/${latest.number}`); }, [latest, router]);
  if (loading || latest) return <PageSkeleton />;
  return <Page><EmptyState icon="📺" title="No recaps yet">The first recap appears after Episode 2 is scored.</EmptyState></Page>;
}
