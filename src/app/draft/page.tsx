import { Page, EmptyState, Button } from '@/components/ui';

// S51 has no draft. The S50 live-draft page was retired with the move to
// weekly pick cards; its history remains in git.
export default function DraftPage() {
  return (
    <Page>
      <EmptyState icon="📋" title="No draft this season" action={<Button href="/picks">Go to your pick card</Button>}>
        Every week you fill a fresh pick card instead of keeping a roster.
      </EmptyState>
    </Page>
  );
}
