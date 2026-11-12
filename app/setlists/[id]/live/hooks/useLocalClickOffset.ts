import { useCallback, useEffect, useRef, useState } from "react";
import { adjustLocalClickOffset } from "./midiInput";

export function useLocalClickOffset() {
  const [offsetMs, setOffsetMs] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const offsetMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adjust = useCallback((delta: number) => {
    if (!Number.isFinite(delta)) return;
    const next = adjustLocalClickOffset(offsetMsRef.current, delta);
    offsetMsRef.current = next;
    setOffsetMs(next);
    setShowFeedback(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowFeedback(false);
      timerRef.current = null;
    }, 1400);
  }, []);

  const reset = useCallback(() => {
    offsetMsRef.current = 0;
    setOffsetMs(0);
    setShowFeedback(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { offsetMs, offsetMsRef, showFeedback, adjust, reset };
}
