import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

// Checks the commissioner PIN against a server-only env var so it never ships
// in the client bundle. Auth is still name-only (see CLAUDE.md); this only
// keeps the PIN out of source.
export async function POST(request: Request) {
  const expected = process.env.COMMISSIONER_PIN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'COMMISSIONER_PIN is not configured' }, { status: 500 });
  }

  let pin = '';
  try {
    const body = await request.json();
    pin = typeof body?.pin === 'string' ? body.pin : '';
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  // Hash both sides so timingSafeEqual always compares equal-length buffers
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const ok = timingSafeEqual(digest(pin), digest(expected));

  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
