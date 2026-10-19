import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";

export interface CountryOption {
  code: string;
  /** "India (+91)" */
  label: string;
  name: string;
}

let cached: CountryOption[] | null = null;

/** Every country with its calling code, sorted by name. */
export function countryOptions(): CountryOption[] {
  if (cached) return cached;
  const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  cached = getCountries()
    .map((code: CountryCode) => {
      const name = names?.of(code) ?? code;
      return { code, name, label: `${name} (+${getCountryCallingCode(code)})` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "India";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** The deployment default when an organization hasn't chosen (matches the API's setting). */
export const DEFAULT_PHONE_REGION = "IN";
