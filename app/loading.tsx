function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-white/[0.07] motion-reduce:animate-none ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="min-h-[100dvh] w-full overflow-hidden bg-surface px-4 pb-8 pt-safe text-on-surface sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 sm:gap-9">
        {/* Header placeholder */}
        <header className="flex h-14 items-center justify-between border-b border-outline-variant/30">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <SkeletonBlock className="h-3.5 w-28" />
              <SkeletonBlock className="h-2.5 w-16" />
            </div>
          </div>
          <SkeletonBlock className="h-9 w-9 rounded-full" />
        </header>

        {/* Page title and primary action */}
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <SkeletonBlock className="h-7 w-44 sm:h-8 sm:w-56" />
            <SkeletonBlock className="h-3.5 w-56 max-w-[75vw] sm:w-72" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-xl" />
        </section>

        {/* Summary cards */}
        <section aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4 sm:p-5"
            >
              <SkeletonBlock className="mb-4 h-3 w-20" />
              <SkeletonBlock className="h-7 w-16" />
              <SkeletonBlock className="mt-3 h-2.5 w-28 max-w-full" />
            </div>
          ))}
        </section>

        {/* Main content and side panel placeholders */}
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(250px,0.8fr)]">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="space-y-2.5">
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="h-3 w-48 max-w-[60vw]" />
              </div>
              <SkeletonBlock className="h-8 w-20 rounded-lg" />
            </div>
            <div className="space-y-3.5">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl bg-white/[0.025] p-3">
                  <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-3.5 w-2/5" />
                    <SkeletonBlock className="h-3 w-3/5" />
                  </div>
                  <SkeletonBlock className="hidden h-7 w-16 rounded-lg sm:block" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4 sm:p-5">
            <SkeletonBlock className="mb-5 h-4 w-32" />
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-3 w-2/5" />
                    <SkeletonBlock className="h-2.5 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
