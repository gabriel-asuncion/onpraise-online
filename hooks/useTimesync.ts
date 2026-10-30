"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

export function useTimesync() {
  const [isSynced, setIsSynced] = useState(false);
  const offsetRef = useRef<number>(0);
  const hasInitialOffsetRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const syncClock = async () => {
      try {
        const t0 = Date.now();

        const res = await fetch('/api/timesync', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Server rejected timesync ping with status: ${res.status}`);
        }

        const { serverTime } = await res.json();
        const t3 = Date.now();

        if (!isActive) return;
        if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) {
          throw new Error("Timesync response did not contain a valid server timestamp.");
        }

        const roundTripTime = t3 - t0;
        const measuredOffset = serverTime - ((t0 + t3) / 2);
        offsetRef.current = hasInitialOffsetRef.current
          ? offsetRef.current + (measuredOffset - offsetRef.current) * 0.25
          : measuredOffset;
        hasInitialOffsetRef.current = true;
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

  const getGlobalTime = useCallback(() => Date.now() + offsetRef.current, []);

  return { isSynced, getGlobalTime };
}