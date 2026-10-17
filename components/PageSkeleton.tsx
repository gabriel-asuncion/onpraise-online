import React from "react";

type SkeletonVariant = "dashboard" | "events" | "event-detail" | "studio" | "live" | "song-library" | "song-review" | "song-editor";

function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-white/[0.07] motion-reduce:animate-none ${className}`} />;
}

function Header({ back = false }: { back?: boolean }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/30 px-4 pt-safe">
      <div className="flex items-center gap-3">
        {back && <Block className="h-9 w-9 rounded-full" />}
        <Block className="h-8 w-8 rounded-xl" />
        <div className="space-y-2"><Block className="h-3.5 w-28" /><Block className="h-2.5 w-16" /></div>
      </div>
      <Block className="h-9 w-9 rounded-full" />
    </header>
  );
}

function CardRows({ count = 3 }: { count?: number }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, i) => (
    <div key={i} className="flex items-center gap-3 rounded-xl border border-outline-variant/20 bg-white/[0.025] p-3">
      <Block className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2"><Block className="h-3.5 w-2/5" /><Block className="h-3 w-3/5" /></div>
      <Block className="hidden h-7 w-16 rounded-lg sm:block" />
    </div>
  ))}</div>;
}

function DashboardSkeleton() {
  return <><Header /><main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden px-4 pb-28 pt-3">
    <section className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 md:p-6">
      <Block className="h-8 w-52 max-w-full" /><Block className="mt-2 h-8 w-36" />
      <div className="mt-6 rounded-2xl border border-outline-variant/20 bg-surface-container p-4"><Block className="mb-4 h-3 w-24" /><Block className="h-4 w-full" /><Block className="mt-2 h-4 w-4/5" /><Block className="mt-3 h-3 w-28" /></div>
    </section>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-outline-variant/20 bg-surface-container p-4"><Block className="mb-4 h-3 w-20" /><Block className="h-7 w-14" /></div>)}</section>
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4"><Block className="mb-4 h-4 w-40" /><CardRows count={2} /></section>
  </main></>;
}

function EventsSkeleton({ detail = false }: { detail?: boolean }) {
  return <><Header back={detail} /><main className="mx-auto w-full max-w-7xl flex-1 overflow-hidden px-4 py-5 md:px-8">
    <div className="mb-5 flex items-center justify-between gap-4"><div className="space-y-2.5"><Block className="h-8 w-40" /><Block className="h-3 w-52 max-w-[70vw]" /></div><Block className="h-10 w-28 rounded-xl" /></div>
    {detail ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]"><section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4"><Block className="h-5 w-44" /><CardRows count={4} /></section><section className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4"><Block className="h-5 w-36" /><CardRows count={3} /></section></div> : <>
      <div className="mb-5 rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-4"><Block className="mb-4 h-4 w-32" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Block key={i} className="h-10 rounded-xl" />)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <article key={i} className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-5"><Block className="h-5 w-28 rounded-full" /><Block className="h-6 w-3/4" /><Block className="h-3 w-full" /><Block className="h-3 w-2/3" /><Block className="h-8 w-32" /></article>)}</div>
    </>}
  </main></>;
}

function StudioSkeleton() {
  return <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 pb-10 pt-8">
    <header className="mb-6 flex items-center justify-between gap-4"><div className="flex items-center gap-3.5"><Block className="h-11 w-11 rounded-full" /><div className="space-y-2"><Block className="h-5 w-36" /><Block className="h-3 w-28" /></div></div><Block className="h-10 w-28 rounded-xl" /></header>
    <Block className="mb-8 h-12 w-full rounded-xl" /><div className="mb-3 flex justify-between px-1"><Block className="h-3 w-20" /><Block className="h-3 w-16" /></div><CardRows count={5} />
  </main>;
}

function LiveSkeleton() {
  return <main className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-surface px-4 text-on-surface">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant/30 pt-safe">
      <div className="flex items-center gap-3"><Block className="h-9 w-9 rounded-full" /><div className="space-y-2"><Block className="h-4 w-36" /><Block className="h-2.5 w-24" /></div></div>
      <div className="flex gap-2"><Block className="h-8 w-8 rounded-full" /><Block className="h-8 w-8 rounded-full" /><Block className="h-8 w-8 rounded-full" /></div>
    </header>
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden py-4">
      <div className="mb-3 flex items-center justify-between gap-3"><Block className="h-3 w-24" /><Block className="h-3 w-20" /></div>
      <div className="mb-4 flex items-center justify-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container/60 px-4 py-3"><Block className="h-7 w-7 rounded-full" /><Block className="h-4 w-40 max-w-[55vw]" /><Block className="h-7 w-7 rounded-full" /></div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/70 p-4 sm:p-6">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="flex min-h-10 items-center gap-4 border-b border-outline-variant/10 pb-3"><Block className="h-3 w-10 shrink-0" /><Block className={`h-4 ${i % 3 === 0 ? "w-3/4" : i % 2 === 0 ? "w-2/3" : "w-1/2"}`} /></div>)}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-outline-variant/30 bg-surface-container/80 p-3"><Block className="h-9 w-9 rounded-full" /><div className="flex gap-2"><Block className="h-7 w-7 rounded-full" /><Block className="h-7 w-7 rounded-full" /><Block className="h-7 w-7 rounded-full" /><Block className="h-7 w-7 rounded-full" /></div><Block className="h-9 w-9 rounded-full" /></div>
    </div>
  </main>;
}

function SongLibrarySkeleton({ review = false }: { review?: boolean }) {
  return <main className="flex min-h-full w-full flex-col overflow-hidden bg-surface px-4 text-on-surface">
    <header className="shrink-0 border-b border-outline-variant/30 py-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3">{review && <Block className="h-10 w-10 rounded-full" />}<div className="space-y-2"><Block className="h-6 w-36" /><Block className="h-3 w-52 max-w-[65vw]" /></div></div><Block className="h-10 w-28 rounded-xl" /></div>{review ? <Block className="h-10 w-full rounded-xl" /> : <div className="flex gap-2 overflow-hidden">{[0, 1, 2, 3, 4].map(i => <Block key={i} className="h-9 w-24 shrink-0 rounded-full" />)}</div>}</header>
    <section className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 py-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map(i => <article key={i} className="space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container/70 p-5"><div className="flex gap-2"><Block className="h-5 w-20 rounded-full" /><Block className="h-5 w-24 rounded-full" /></div><Block className="h-6 w-4/5" /><Block className="h-3 w-3/5" /><div className="flex gap-3 pt-3"><Block className="h-8 flex-1 rounded-lg" /><Block className="h-8 flex-1 rounded-lg" /></div></article>)}</section>
  </main>;
}

function SongEditorSkeleton() {
  return <main className="flex h-full min-h-full w-full flex-col overflow-hidden bg-surface text-on-surface">
    <header className="shrink-0 border-b border-outline-variant/30 bg-surface/90">
      <div className="flex items-center justify-between px-4 py-3.5 md:px-8"><div className="flex items-center gap-3"><Block className="h-8 w-8 rounded-full" /><Block className="h-5 w-48 max-w-[50vw]" /></div><div className="hidden gap-2 md:flex"><Block className="h-8 w-24 rounded-lg" /><Block className="h-8 w-28 rounded-lg" /></div></div>
      <div className="flex gap-5 border-t border-outline-variant/20 px-4 py-4 md:px-8">{[0, 1, 2, 3].map(i => <Block key={i} className="h-3 w-16" />)}</div>
    </header>
    <section className="flex-1 space-y-4 overflow-hidden p-4 md:p-8"><div className="h-56 rounded-2xl border border-outline-variant/30 bg-surface-container/70 animate-pulse motion-reduce:animate-none" /><div className="h-[min(50vh,28rem)] rounded-2xl border border-outline-variant/30 bg-surface-container/70 animate-pulse motion-reduce:animate-none" /></section>
  </main>;
}

export default function PageSkeleton({ message = "Loading...", variant = "dashboard" }: { message?: string; variant?: SkeletonVariant }) {
  let skeleton: React.ReactNode;
  switch (variant) {
    case "dashboard": skeleton = <DashboardSkeleton />; break;
    case "events": skeleton = <EventsSkeleton />; break;
    case "event-detail": skeleton = <EventsSkeleton detail />; break;
    case "studio": skeleton = <StudioSkeleton />; break;
    case "live": skeleton = <LiveSkeleton />; break;
    case "song-library": skeleton = <SongLibrarySkeleton />; break;
    case "song-review": skeleton = <SongLibrarySkeleton review />; break;
    case "song-editor": skeleton = <SongEditorSkeleton />; break;
  }
  return <div aria-busy="true" aria-label={message} className="fixed inset-0 z-[500000] min-h-[100dvh] w-full overflow-y-auto bg-surface">{skeleton}<span className="sr-only" role="status">{message}</span></div>;
}
