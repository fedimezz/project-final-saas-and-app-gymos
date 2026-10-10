import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme, radius, spacing, typography } from "@/theme/ThemeContext";
import BottomSheet from "@/components/BottomSheet";
import { PAYMENT_COUNTRIES } from "@/lib/payment-country";

export default function PaymentCountryPicker({
  visible,
  selectedCode,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedCode: string;
  onClose: () => void;
  onSelect: (countryCode: string) => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const countries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return query
      ? PAYMENT_COUNTRIES.filter(({ code, name }) =>
          name.toLocaleLowerCase("fr").includes(query) || code.toLowerCase().includes(query)
        )
      : PAYMENT_COUNTRIES;
  }, [search]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      style={{ maxHeight: "82%", gap: spacing.sm }}
    >
      <Text style={[typography.h2, { color: colors.text }]}>Choisissez votre pays</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher un pays"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Rechercher un pays"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          color: colors.text,
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {countries.map(({ code, name }) => (
          <Pressable
            key={code}
            onPress={() => {
              onSelect(code);
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: code === selectedCode }}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={[typography.body, { color: colors.text }]}>{name}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{code}</Text>
          </Pressable>
        ))}
        {countries.length === 0 ? (
          <View style={{ paddingVertical: spacing.lg }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>Aucun pays correspondant.</Text>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
