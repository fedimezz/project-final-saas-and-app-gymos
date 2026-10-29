"use client";

import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";

countries.registerLocale(fr);

const options = Object.keys(countries.getAlpha2Codes())
  .filter((code) => code !== "ZZ")
  .map((code) => ({ code, name: countries.getName(code, "fr") ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

export default function CountrySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted">Pays</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-primary disabled:opacity-60"
      >
        <option value="">Choisissez votre pays</option>
        {options.map(({ code, name }) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
