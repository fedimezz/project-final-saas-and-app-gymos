"use client";
// PhoneInput — international phone field with a searchable country picker.
//
//  • `value` / `onChange` speak E.164 ("+21620123456"), the exact format the
//    API stores (see lib/phone.ts), so callers never do their own parsing.
//  • onChange(value, { valid, country }) — `value` is "" until the user types
//    digits; `valid` is true only for a plausible E.164 number.
//  • Country flags are emoji, names come from Intl.DisplayNames (French).
//  • Default country: `defaultCountry` prop → browser locale region → Tunisia.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  DEFAULT_COUNTRY,
  countryFromE164,
  dialCodeOf,
  flagEmoji,
  isValidCountryCode,
  listCountries,
} from "@/lib/countries";
import { isValidE164 } from "@/lib/phone";

export interface PhoneChangeMeta {
  valid: boolean;
  country: string;
}

interface PhoneInputProps {
  value: string;
  onChange: (e164: string, meta: PhoneChangeMeta) => void;
  defaultCountry?: string | null;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

// Light per-country grouping of the national number ("20 123 456" for TN).
// Anything not listed is grouped in threes, which reads fine for a phone field.
const GROUPS: Record<string, number[]> = {
  TN: [2, 3, 3],
  FR: [1, 2, 2, 2, 2],
  DZ: [3, 2, 2, 2],
  MA: [1, 2, 2, 2, 2],
  LY: [2, 3, 4],
  EG: [2, 4, 4],
  SA: [2, 3, 4],
  AE: [2, 3, 4],
  US: [3, 3, 4],
  CA: [3, 3, 4],
  GB: [4, 6],
  DE: [3, 4, 4],
  IT: [3, 3, 4],
};

export function formatNational(country: string, digits: string): string {
  const groups = GROUPS[country.toUpperCase()];
  const out: string[] = [];
  let i = 0;
  if (groups) {
    for (const g of groups) {
      if (i >= digits.length) break;
      out.push(digits.slice(i, i + g));
      i += g;
    }
  }
  while (i < digits.length) {
    out.push(digits.slice(i, i + 3));
    i += 3;
  }
  return out.join(" ");
}

function detectLocaleCountry(): string | null {
  if (typeof navigator === "undefined") return null;
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  return region && isValidCountryCode(region) ? region : null;
}

function split(value: string, fallbackCountry: string): { country: string; digits: string } {
  if (value.startsWith("+")) {
    const country = countryFromE164(value);
    const dial = country ? dialCodeOf(country) : null;
    if (country && dial) return { country, digits: value.slice(1 + dial.length) };
  }
  return { country: fallbackCountry, digits: value.replace(/\D/g, "") };
}

export default function PhoneInput({
  value,
  onChange,
  defaultCountry,
  id,
  name,
  required,
  disabled,
  placeholder,
  className = "",
  inputClassName = "",
}: PhoneInputProps) {
  const reactId = useId();
  const inputId = id ?? `phone-${reactId}`;
  const listId = `${inputId}-countries`;

  const fallback = useMemo(
    () => (defaultCountry && isValidCountryCode(defaultCountry) ? defaultCountry.toUpperCase() : DEFAULT_COUNTRY),
    [defaultCountry]
  );

  const initial = useMemo(() => split(value, fallback), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState(initial.country);
  const [digits, setDigits] = useState(initial.digits);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const countries = useMemo(() => listCountries("fr"), []);

  // No explicit default → prefer the visitor's locale region once we're on the client.
  useEffect(() => {
    if (defaultCountry || value) return;
    const detected = detectLocaleCountry();
    if (detected) setCountry(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The parent changed the value from outside (e.g. form reset, loaded profile).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const next = split(value, country);
    setCountry(next.country);
    setDigits(next.digits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const emit = (nextCountry: string, nextDigits: string) => {
    const dial = dialCodeOf(nextCountry) ?? "";
    // A trunk "0" ("06 12…") is not part of the international number.
    const national = nextDigits.replace(/^0+/, "");
    const e164 = national ? `+${dial}${national}` : "";
    lastEmitted.current = e164;
    onChange(e164, { valid: isValidE164(e164), country: nextCountry });
  };

  const selected = countries.find((c) => c.code === country);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? countries.filter(
        (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || c.dialCode.startsWith(q.replace("+", ""))
      )
    : countries;

  return (
    <div ref={rootRef} className={`relative flex ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Pays : ${selected?.name ?? country}, indicatif +${selected?.dialCode ?? ""}`}
        className="flex items-center gap-1.5 px-3 py-2.5 bg-background border border-border rounded-l-xl text-sm text-primary hover:bg-card transition-colors disabled:opacity-60 shrink-0"
      >
        <span className="text-base leading-none" aria-hidden="true">{flagEmoji(country)}</span>
        <span className="font-mono text-xs">+{selected?.dialCode}</span>
        <ChevronDown size={13} className="text-muted" aria-hidden="true" />
      </button>

      <input
        id={inputId}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required={required}
        disabled={disabled}
        value={formatNational(country, digits)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 15);
          setDigits(next);
          emit(country, next);
        }}
        placeholder={placeholder ?? (country === "TN" ? "20 123 456" : "Numéro de téléphone")}
        className={`w-full min-w-0 px-4 py-2.5 bg-background border border-l-0 border-border rounded-r-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all ${inputClassName}`}
      />

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-lg">
          <div className="relative p-2 border-b border-border">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un pays ou un indicatif"
              aria-label="Rechercher un pays"
              className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-2"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Pays" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">Aucun résultat</li>}
            {filtered.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === country}>
                <button
                  type="button"
                  onClick={() => {
                    setCountry(c.code);
                    setOpen(false);
                    emit(c.code, digits);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-background transition-colors ${
                    c.code === country ? "bg-background font-semibold" : ""
                  }`}
                >
                  <span className="text-base leading-none" aria-hidden="true">{c.flag}</span>
                  <span className="flex-1 truncate text-primary">{c.name}</span>
                  <span className="font-mono text-xs text-muted">+{c.dialCode}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
