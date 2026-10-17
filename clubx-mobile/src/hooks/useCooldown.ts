import { useCallback, useEffect, useState } from "react";

/** Countdown in whole seconds, e.g. for "Renvoyer le code (42 s)". `start(n)` (re)starts it. */
export function useCooldown(initial = 0) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  const start = useCallback((n: number) => setSeconds(Math.max(0, Math.ceil(n))), []);
  return { seconds, start, active: seconds > 0 };
}
