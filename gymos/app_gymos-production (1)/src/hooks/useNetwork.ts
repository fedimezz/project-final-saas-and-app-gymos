import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/** `true` unless the device reports it has no internet (unknown counts as online). */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);
  return online;
}
