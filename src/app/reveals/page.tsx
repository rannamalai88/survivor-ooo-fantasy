import { redirect } from 'next/navigation';

// Reveals moved to Matchups (same reveal-at-lock rule, side-by-side cards).
export default function RevealsPage() {
  redirect('/matchups');
}
