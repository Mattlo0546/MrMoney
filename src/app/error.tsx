'use client';

/** Last-resort recovery: if a page throws, offer a retry and a full reset instead of a blank screen. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const hardReset = () => {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('mrmoney') || k.startsWith('studentplan')) localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
    window.location.href = '/plan';
  };
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <p className="text-sm text-muted">{error.message}</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-full border px-5 py-2.5 font-semibold">Try again</button>
        <button type="button" onClick={hardReset} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-white">Reset MrMoney</button>
      </div>
    </main>
  );
}
