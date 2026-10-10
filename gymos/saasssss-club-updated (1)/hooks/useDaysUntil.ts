"use client";

import { useEffect, useState } from "react";

/**
 * Days remaining until `isoDate`, clamped to >= 0.
 *
 * Deliberately does NOT call Date.now() during render: that's an impure
 * call whose result can differ between the server render and the client
 * render (or between re-renders), which is exactly the kind of thing that
 * causes hydration mismatches. Instead this returns 0 on the very first
 * render (server-safe) and corrects itself in an effect once mounted on
 * the client — the same pattern already used by ThemeContext for reading
 * localStorage safely.
 */
export function useDaysUntil(isoDate: string | undefined | null): number {
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    if (!isoDate) {
      setDaysLeft(0);
      return;
    }
    const diff = new Date(isoDate).getTime() - Date.now();
    setDaysLeft(Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))));
  }, [isoDate]);

  return daysLeft;
}
