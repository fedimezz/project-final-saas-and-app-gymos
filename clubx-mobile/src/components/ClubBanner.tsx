import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthContext";
import { useBrand } from "@/brand/BrandContext";
import { useTheme, radius, spacing, typography } from "@/theme/ThemeContext";
import { heroPlan } from "@/lib/clubBrand";
import { mix } from "@/theme/palette";
import ClubLogo from "@/components/ClubLogo";
import ClubHero3D from "@/components/ClubHero3D";

const HERO_SIZE = 128;

/**
 * Top card of the member and coach home screens: the CLUB's own brand — logo,
 * name, brand-tinted background (its theme colors) and its 3D hero object, the
 * same one as on the club's website. A club that turned the 3D hero off simply
 * gets the card without it.
 */
export default function ClubBanner({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  const { club } = useAuth();
  const { brand } = useBrand();

  const name = brand?.name || club?.name || "";
  const logo = brand?.logoUrl ?? club?.logoUrl ?? null;
  const has3D = !!brand && heroPlan(brand).kind !== "none";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 150,
        paddingVertical: spacing.lg,
        paddingLeft: spacing.lg,
        paddingRight: has3D ? spacing.sm : spacing.lg,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: mix(colors.border, colors.primary, 0.25),
        backgroundColor: mix(colors.surface, colors.primary, 0.07),
        overflow: "hidden",
      }}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        {name ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <ClubLogo name={name} uri={logo} size={34} />
            <Text style={[typography.overline, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ) : null}
        <View>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>
        </View>
      </View>

      {has3D && brand ? (
        <ClubHero3D
          brand={brand}
          size={HERO_SIZE}
          fallback={
            <View
              style={{
                width: HERO_SIZE * 0.62,
                height: HERO_SIZE * 0.62,
                borderRadius: HERO_SIZE,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: mix(colors.surface, colors.primary, 0.14),
              }}
            >
              <Ionicons name="barbell-outline" size={HERO_SIZE * 0.3} color={colors.primary} />
            </View>
          }
        />
      ) : null}
    </View>
  );
}
