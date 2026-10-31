'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSnapshot } from '@/lib/store';
import { Spinner } from '@/components/ui/Spinner';

/** Sends the visitor to /plan if the client-side store has a plan, else /onboarding. */
export function HomeRedirect() {
  const router = useRouter();
  const { hydrated, state } = useAppSnapshot();
  useEffect(() => {
    if (!hydrated) return;
    router.replace(state ? '/plan' : '/onboarding');
  }, [hydrated, state, router]);
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status" aria-label="Loading">
      <Spinner size={32} />
    </div>
  );
}
