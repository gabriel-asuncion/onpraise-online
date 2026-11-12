import { useCallback, useEffect, useRef, useState } from "react";

export function useControlFeedback() {
  const [feedback, setFeedback] = useState<{ label: string; value: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((label: string, value: string) => {
    setFeedback({ label, value });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setFeedback(null); timer.current = null; }, 1400);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { feedback, show };
}
