'use client';

import { DiscrepancyReview } from '@/components/discrepancy-review';
import { Toaster } from '@/components/ui/toaster';

export default function ReconciliationPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto py-8 px-4">
      <DiscrepancyReview jobId={params.id} />
      <Toaster />
    </div>
  );
}
