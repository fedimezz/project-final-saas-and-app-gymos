import { Text } from "react-native";
import { useTheme, typography } from "@/theme/ThemeContext";
import Card from "@/components/Card";

/** Inline confirmation ("Session réservée…"). Renders nothing when there's no message. */
export default function NoticeBanner({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Card style={{ borderColor: colors.success }} accessibilityLiveRegion="polite">
      <Text style={[typography.body, { color: colors.success, fontWeight: "700" }]}>{message}</Text>
    </Card>
  );
}
