import { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { useTheme, radius, typography } from "@/theme/ThemeContext";
import { initials } from "@/lib/format";

/** A club's logo (when it has a usable https one) or a branded initials tile. */
export default function ClubLogo({ name, uri, size = 48 }: { name: string; uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  // Remember WHICH uri failed (not just "failed"): when the club replaces its
  // logo the new uri differs, so it is retried automatically — no effect needed.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const usable = !!uri && /^https?:\/\//i.test(uri) && failedUri !== uri;
  const r = Math.round(size * 0.28);
  
  if (usable) {
    return (
      <Image
        source={{ uri: uri! }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.border }}
        contentFit="cover"
        cachePolicy="disk"
        onError={() => setFailedUri(uri ?? null)}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: r || radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={[typography.h2, { color: colors.primaryText, fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}
