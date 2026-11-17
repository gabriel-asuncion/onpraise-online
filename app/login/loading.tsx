export default function LoginLoading() {
  return (
    <main aria-busy="true" aria-label="Checking your sign-in" className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-white px-6">
      <div aria-hidden="true" className="w-full max-w-sm space-y-5">
        <div className="mx-auto h-56 w-56 animate-pulse rounded-full bg-zinc-100 motion-reduce:animate-none" />
        <div className="mx-auto h-8 w-3/4 animate-pulse rounded-lg bg-zinc-100 motion-reduce:animate-none" />
        <div className="mx-auto h-4 w-4/5 animate-pulse rounded bg-zinc-100 motion-reduce:animate-none" />
        <div className="h-14 animate-pulse rounded-2xl bg-zinc-100 motion-reduce:animate-none" />
      </div>
      <p role="status" className="mt-6 text-xs font-semibold text-zinc-500">Checking your sign-in...</p>
    </main>
  );
}
