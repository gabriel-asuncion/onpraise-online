"use client";

import dynamic from "next/dynamic";

// ✅ SURGICAL FIX: Cast 'mod' to any to silence TypeScript, and strictly return the default export.
const LiveRehearsalFab = dynamic(
  () => import("./LiveRehearsalFab").then((mod: typeof import("./LiveRehearsalFab")) => mod.default),
  { ssr: false }
);

export default function FabWrapper() {
  return <LiveRehearsalFab />;
}