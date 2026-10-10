import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";

/** Pushes the roster screen over the coach tabs. */
export function useOpenRoster() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (sessionId: string) => navigation.navigate("CoachRoster", { sessionId });
}
