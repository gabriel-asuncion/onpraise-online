"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

export function useTimesync() {
  const [isSynced, setIsSynced] = useState(false);
  const clockQualityRef = useRef<{ roundTripTimeMs: number | null; uncertaintyMs: number | null }>({
    roundTripTimeMs: null,
    uncertaintyMs: null
  });
  const offsetRef = useRef<number>(0);
  const hasInitialOffsetRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    const samples: Array<{ offset: number; roundTripTimeMs: number }> = [];
    offsetRef.current = Date.now() - performance.now();
    let lastAdjustmentTime = performance.now();

    const syncClock = async () => {
      try {
        const t0 = performance.now();

        const res = await fetch('/api/timesync', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Server rejected timesync ping with status: ${res.status}`);
        }

        const response = await res.json() as { serverTime?: unknown };
        const t3 = performance.now();

        if (!isActive) return;
        if (typeof response.serverTime !== "number" || !Number.isFinite(response.serverTime)) {
          throw new Error("Timesync response did not contain a valid server timestamp.");
        }

        const roundTripTime = t3 - t0;
        const measuredOffset = response.serverTime - ((t0 + t3) / 2);
        samples.push({ offset: measuredOffset, roundTripTimeMs: roundTripTime });
        if (samples.length > 8) samples.shift();

        const bestSample = samples.reduce((best, sample) =>
          sample.roundTripTimeMs < best.roundTripTimeMs ? sample : best
        );
        if (!hasInitialOffsetRef.current) {
          offsetRef.current = bestSample.offset;
          hasInitialOffsetRef.current = true;
        } else {
          const elapsedSinceAdjustment = Math.max(0, t3 - lastAdjustmentTime);
          const maxAdjustment = Math.max(1, elapsedSinceAdjustment * 0.05);
          const offsetDifference = bestSample.offset - offsetRef.current;
          offsetRef.current += Math.max(-maxAdjustment, Math.min(maxAdjustment, offsetDifference));
        }
        lastAdjustmentTime = t3;
        clockQualityRef.current = {
          roundTripTimeMs: bestSample.roundTripTimeMs,
          uncertaintyMs: bestSample.roundTripTimeMs / 2
        };
        setIsSynced(true);
      } catch (err) {
        console.warn("Timesync ping failed cleanly:", err);
      }
    };

    void syncClock();
    const interval = setInterval(syncClock, 10000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  const getGlobalTime = useCallback(() => performance.now() + offsetRef.current, []);
  const getClockQuality = useCallback(() => clockQualityRef.current, []);

  return { isSynced, getGlobalTime, getClockQuality };
}