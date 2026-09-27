'use client';

import { usePathname } from 'next/navigation';
import Nav from '@/components/layout/Nav';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <main className="min-h-screen">{children}</main>;
  return (
    <>
      <Nav />
      <main className="min-h-[calc(100vh-56px)]">{children}</main>
    </>
  );
}
