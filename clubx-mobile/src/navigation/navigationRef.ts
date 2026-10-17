import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/types";
import type { PushTab } from "@/notifications/pushCore";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// A notification tapped while the app was closed arrives before the navigator
// has mounted: keep the target and apply it as soon as the container is ready.
let pending: PushTab | null = null;

function go(target: PushTab): boolean {
  if (!navigationRef.isReady()) return false;
  if (target.navigator === "MemberTabs") navigationRef.navigate("MemberTabs", { screen: target.screen });
  else navigationRef.navigate("CoachTabs", { screen: target.screen });
  return true;
}

export function navigateToTab(target: PushTab): void {
  if (!go(target)) pending = target;
}

export function flushPendingNavigation(): void {
  if (pending && go(pending)) pending = null;
}
