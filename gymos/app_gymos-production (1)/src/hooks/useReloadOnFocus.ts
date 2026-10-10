import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

const POLL_INTERVAL_MS = 30_000;

/**
 * Refreshes focused screens when the app returns to the foreground and while
 * they remain visible, so website updates appear without restarting the app.
 * The mount fetch covers the first focus; later refreshes are throttled.
 */
export function useReloadOnFocus(reload: () => void, minGapMs = 20_000, pollIntervalMs = POLL_INTERVAL_MS) {
  const first = useRef(true);
  const last = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const refreshIfDue = () => {
        if (AppState.currentState !== "active") return;
        const now = Date.now();
        if (now - last.current < minGapMs) return;
        last.current = now;
        reload();
      };

      if (first.current) {
        first.current = false;
        last.current = Date.now();
      } else {
        refreshIfDue();
      }

      const appStateSubscription = AppState.addEventListener("change", (state) => {
        if (state === "active") refreshIfDue();
      });
      const interval = setInterval(refreshIfDue, pollIntervalMs);

      return () => {
        appStateSubscription.remove();
        clearInterval(interval);
      };
    }, [reload, minGapMs, pollIntervalMs])
  );
}
