"use client";

import * as React from "react";
import { useOrganization } from "@/lib/api/hooks";
import { DEFAULT_PHONE_REGION, countryName } from "@/lib/countries";
import { useAuth } from "./auth";

/**
 * Hint for every phone input. Numbers typed without a country code are read as the organization's
 * country (Settings → Organization), so say which one. Everyone with org:read sees the real country.
 */
export function usePhoneHint(): React.ReactNode {
  const { can } = useAuth();
  const org = useOrganization(can("org:read"));
  const country = countryName(org.data?.default_phone_region ?? DEFAULT_PHONE_REGION);
  return (
    <>
      Add the country code for numbers outside {country}, e.g. +65 9123 4567.
    </>
  );
}
