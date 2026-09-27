import { redirect } from 'next/navigation';

// My Season now lives on your manager profile.
export default function MyTeamPage() {
  redirect('/managers/me');
}
