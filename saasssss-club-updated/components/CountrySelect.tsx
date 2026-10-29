"use client";
// CountrySelect — plain accessible <select> of countries (French names, flag
// emoji), priority countries first. Value is the ISO 3166-1 alpha-2 code.
//
// Hydration: the localised, sorted list comes from Intl.DisplayNames +
// localeCompare, which give slightly different results in Node (server) and
// in the browser (different ICU data) — that is what produced the
// "Hydration failed ... 🇭🇰 vs 🇭🇺" error. So the server AND the first client
// render only output the currently selected option (identical on both sides),
// and the full list is filled in right after mount.

import { useEffect, useState } from "react";
import { listCountries, flagEmoji, type Country } from "@/lib/countries";

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function CountrySelect({ value, onChange, id, name, required, disabled, className = "" }: CountrySelectProps) {
  const [countries, setCountries] = useState<Country[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fill the list client-side only (see header)
    setCountries(listCountries("fr"));
  }, []);

  return (
    <select
      id={id}
      name={name}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="country"
      className={`w-full px-3 py-2.5 bg-background border border-border rounded-xl text-primary text-sm focus:outline-none focus:ring-2 transition-all ${className}`}
    >
      {countries === null ? (
        <option value={value}>
          {flagEmoji(value)} {value}
        </option>
      ) : (
        countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.name}
          </option>
        ))
      )}
    </select>
  );
}
