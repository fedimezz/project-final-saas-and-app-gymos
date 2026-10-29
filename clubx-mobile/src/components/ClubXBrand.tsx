import { Text, View } from "react-native";
import { useTheme, spacing, typography } from "@/theme/ThemeContext";
import ClubXMark from "@/components/ClubXMark";

/**
 * The ClubX identity: mascot badge + wordmark. Shown while no club is selected
 * (launch, "Mes salles", club search). Once a club is chosen the screens show
 * the CLUB's own brand instead, with ClubX reduced to a small "Propulsé par".
 */
export default function ClubXBrand({ size = 52, tagline = true }: { size?: number; tagline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }} accessible accessibilityLabel="ClubX">
      <ClubXMark size={size} />
      <View>
        <Text style={[typography.display, { color: colors.text, fontSize: size * 0.62, lineHeight: size * 0.7, letterSpacing: -1.2 }]}>ClubX</Text>
        {tagline ? <Text style={[typography.overline, { color: colors.textMuted, marginTop: 2 }]}>Votre salle, dans la poche</Text> : null}
      </View>
    </View>
  );
}

/** Small "Propulsé par ClubX" line for club-branded screens. */
export function PoweredByClubX() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, opacity: 0.8 }} accessible accessibilityLabel="Propulsé par ClubX">
      <ClubXMark size={20} />
      <Text style={[typography.small, { color: colors.textMuted }]}>Propulsé par ClubX</Text>
    </View>
  );
}
