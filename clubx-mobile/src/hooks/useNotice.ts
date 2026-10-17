import { useEffect, useState } from "react";

/** A short-lived success message: `const [notice, setNotice] = useNotice()` — clears itself after `ms`. */
export function useNotice(ms = 3500) {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), ms);
    return () => clearTimeout(timer);
  }, [notice, ms]);
  return [notice, setNotice] as const;
}
