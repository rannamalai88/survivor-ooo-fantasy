import { Page, EmptyState, Button } from '@/components/ui';

// NET (Name the Episode Title) is the Title slot on the S51 pick card.
export default function NetPage() {
  return (
    <Page>
      <EmptyState icon="💬" title="NET is now the Title slot" action={<Button href="/picks">Go to your pick card</Button>}>
        Pick who says the episode title on your weekly card. It&apos;s worth +1, and Jeff is an option.
      </EmptyState>
    </Page>
  );
}
