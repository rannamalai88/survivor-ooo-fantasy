import { redirect } from 'next/navigation';

// The survivor points table moved to /survivors (Points table view).
export default function ScoreboardPage() {
  redirect('/survivors');
}
