export default function OnboardingLoadingSkeleton() {
  return (
    <main aria-busy="true" aria-label="Preparing your workspace" className="min-h-[100dvh] bg-[#0d0e12] px-6 pt-12 text-white sm:flex sm:items-center sm:justify-center sm:pt-6">
      <div className="mx-auto w-full max-w-[420px] space-y-8 sm:rounded-[2rem] sm:border sm:border-white/10 sm:bg-white/[0.02] sm:p-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400 motion-reduce:animate-none" />
            <div className="h-3 w-32 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        </header>
        <section className="space-y-4" aria-hidden="true">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 animate-pulse rounded bg-blue-400/20 motion-reduce:animate-none" />
            <div className="h-3 w-24 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-1.5 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
            ))}
          </div>
        </section>
        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-6 w-3/5 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
          </div>
          <div className="space-y-3">
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
            <div className="h-12 animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
          </div>
          <div className="h-12 animate-pulse rounded-xl bg-blue-500/20 motion-reduce:animate-none" />
        </section>
        <p className="text-center text-[10px] font-black uppercase tracking-[0.18em] text-blue-300/70" role="status">
          Preparing your workspace
        </p>
      </div>
    </main>
  );
}
