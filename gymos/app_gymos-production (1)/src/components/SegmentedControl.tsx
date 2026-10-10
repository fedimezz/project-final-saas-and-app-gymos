import { Pressable, Text, View } from "react-native";
import { useTheme, spacing, radius } from "@/theme/ThemeContext";

interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Pill-style single choice (theme mode, bookings tabs…). */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{ flex: 1, paddingVertical: spacing.sm + 3, alignItems: "center", backgroundColor: selected ? colors.primary : "transparent" }}
          >
            <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: selected ? "700" : "500", fontSize: 14 }}>
              {o.label}
              {o.count !== undefined ? ` (${o.count})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
