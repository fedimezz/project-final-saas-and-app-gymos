import { useMemo, useState } from "react";
import { useResettableState } from "@/hooks/useResettableState";
import { ApiError } from "@/api/client";
import { bookSession, cancelBooking } from "@/api/schedule";
import { useNotice } from "@/hooks/useNotice";
import type { ScheduleSession } from "@/api/types";
import { dateOfDay, formatDayLong } from "@/lib/dates";

// What the booking endpoints return, applied straight onto the list so the
// card flips instantly without refetching the whole week. Dropped as soon as
// fresh server data arrives (pull-to-refresh, week change, 409 resync).
type SessionPatch = Pick<ScheduleSession, "isBookedByUser" | "currentBookings" | "isFull" | "spotsLeft">;

const NO_PATCHES: Record<string, SessionPatch> = {};

interface Options {
  /** The raw sessions from `fetchSchedule` (undefined while loading). */
  sessions: ScheduleSession[] | undefined;
  /** Monday of the week those sessions belong to — a session only knows its weekday. */
  weekMonday: Date;
  reload: () => void;
}

/**
 * Book / cancel flow shared by Schedule and Home: optimistic-free (the server
 * response is applied, never guessed), one confirmation sheet for both
 * actions, a short success notice, and a resync when the server says our list
 * is stale. Render `<SessionSheet {...flow.sheetProps} />` and call `openSheet`.
 */
export function useBookingFlow({ sessions: rawSessions, weekMonday, reload }: Options) {
  const [patches, updatePatches] = useResettableState<Record<string, SessionPatch>>(NO_PATCHES, rawSessions);

  const sessions = useMemo(
    () => (rawSessions ?? []).map((s) => (patches[s.id] ? { ...s, ...patches[s.id] } : s)),
    [rawSessions, patches]
  );

  // `sheetId` outlives `sheetVisible` so the sheet's content doesn't vanish mid-close.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useNotice();

  const sheetSession = sessions.find((s) => s.id === sheetId) ?? null;

  const openSheet = (id: string) => {
    setSheetId(id);
    setError(null);
    setSheetVisible(true);
  };

  const confirm = async () => {
    if (!sheetSession || pending) return;
    const wasBooked = sheetSession.isBookedByUser;
    setPending(true);
    setError(null);
    try {
      const res = wasBooked ? await cancelBooking(sheetSession.id) : await bookSession(sheetSession.id);
      updatePatches((prev) => ({
        ...prev,
        [sheetSession.id]: {
          isBookedByUser: !wasBooked,
          currentBookings: res.session.currentBookings,
          isFull: res.session.isFull,
          spotsLeft: res.session.spotsLeft,
        },
      }));
      setSheetVisible(false);
      setNotice(res.message);
    } catch (e) {
      // 402 = plan booking limit, 409 = full / already booked / not booked;
      // the server's message is already French and user-ready.
      setError(e instanceof ApiError ? e.message : "Action impossible. Vérifiez votre connexion.");
      // 409 means our list is out of date (someone took the last spot, or the
      // booking changed elsewhere) — resync so the sheet reflects reality.
      if (e instanceof ApiError && e.status === 409) reload();
    } finally {
      setPending(false);
    }
  };

  return {
    sessions,
    notice,
    openSheet,
    sheetProps: {
      visible: sheetVisible,
      session: sheetSession,
      dateLabel: sheetSession ? formatDayLong(dateOfDay(weekMonday, sheetSession.day)) : "",
      pending,
      error,
      onClose: () => setSheetVisible(false),
      onConfirm: () => void confirm(),
    },
  };
}
