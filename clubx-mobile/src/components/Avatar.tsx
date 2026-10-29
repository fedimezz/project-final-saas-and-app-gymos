import { Image, Text, View } from "react-native";
import { useTheme, typography } from "@/theme/ThemeContext";
import { initials } from "@/lib/format";

/** Profile picture (Cloudinary URL or inline data URL from the backend), falling back to initials. */
export default function Avatar({ name, uri, size = 56 }: { name: string; uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  const usable = !!uri && (uri.startsWith("http") || uri.startsWith("data:image/"));

  if (usable) {
    return (
      <Image
        source={{ uri: uri! }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border }}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={[typography.h2, { color: colors.primaryText, fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}
