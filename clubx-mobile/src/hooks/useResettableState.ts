import { useCallback, useState } from "react";

/**
 * State that silently goes back to `empty` whenever `key` changes (e.g. local
 * "just booked" overrides that must be dropped once fresh server data arrives).
 * Derived during render instead of a reset-in-effect, so there is no extra
 * render pass and no flash of stale values. `empty` must be a stable constant.
 */
export function useResettableState<T>(empty: T, key: unknown): [T, (update: (prev: T) => T) => void] {
  const [state, setState] = useState<{ key: unknown; value: T }>({ key, value: empty });
  const value = Object.is(state.key, key) ? state.value : empty;
  const update = useCallback(
    (fn: (prev: T) => T) =>
      setState((prev) => ({ key, value: fn(Object.is(prev.key, key) ? prev.value : empty) })),
    [key, empty]
  );
  return [value, update];
}
