import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import Nav from '@/components/layout/Nav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Survivor OOO Fantasy',
  description: 'Outwit. Outplay. Outlast. The ultimate Survivor fantasy league.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Nav />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
