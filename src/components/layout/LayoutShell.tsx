'use client';

import { usePathname } from 'next/navigation';
import Nav from '@/components/layout/Nav';
import UserBadge from '@/components/layout/UserBadge';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <Nav />
      <UserBadge />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
