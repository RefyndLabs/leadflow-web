import { describe, expect, it } from "vitest";
import { countryName, countryOptions } from "../countries";
import {
  channelLabel,
  sourceLabel,
  LEAD_SOURCES,
  TOUCHPOINT_CHANNELS,
} from "../enums";
import { formatPhone, telHref } from "../format";
import { buildPayloads, parseCsv } from "../import";
import { captureConfirm, organizationUpdate } from "../schemas";

describe("phone display (E.164 in, readable out)", () => {
  it("groups international numbers the way people read them", () => {
    expect(formatPhone("+6591234567")).toBe("+65 9123 4567");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+971501234567")).toBe("+971 50 123 4567");
  });

  it("shows anything it can't read as it is, and nothing as a dash", () => {
    expect(formatPhone("98765")).toBe("98765");
    expect(formatPhone("+999")).toBe("+999");
    expect(formatPhone(null)).toBe("—");
  });

  it("dials the raw value, keeping the + and country code", () => {
    expect(telHref("+6591234567")).toBe("tel:+6591234567");
  });
});

describe("countries", () => {
  it("lists every country with its calling code, sorted by name", () => {
    const all = countryOptions();
    expect(all.length).toBeGreaterThan(200);
    expect(all.find((c) => c.code === "IN")?.label).toBe("India (+91)");
    expect(all.find((c) => c.code === "AE")?.label).toBe(
      "United Arab Emirates (+971)",
    );
    expect(all.find((c) => c.code === "SG")?.label).toBe("Singapore (+65)");
    const names = all.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("names the deployment default when none is set", () => {
    expect(countryName(null)).toBe("India");
    expect(countryName("ae")).toBe("United Arab Emirates");
  });
});

describe("organization country setting", () => {
  const base = {
    name: "Acme",
    new_lead_gap_hours: "72",
    fuzzy_match_threshold: "85",
    assignment_strategy: "round_robin",
  };

  it("sends an upper-case two-letter code, or null for the default", () => {
    expect(
      organizationUpdate.parse({ ...base, default_phone_region: "ae" })
        .default_phone_region,
    ).toBe("AE");
    expect(
      organizationUpdate.parse({ ...base, default_phone_region: "" })
        .default_phone_region,
    ).toBeNull();
  });

  it("rejects anything that isn't a country code", () => {
    expect(
      organizationUpdate.safeParse({ ...base, default_phone_region: "UAE" })
        .success,
    ).toBe(false);
  });
});

describe("capture confirm: 'not from a show' is sent, not dropped", () => {
  const person = {
    contact_name: "Mr Lee",
    contact_phone: "+65 9123 4567",
    account_name: "Lee Trading",
    lead_resolution: "auto",
  };

  it("a blank show becomes null, which the API reads as 'not from a show'", () => {
    const body = captureConfirm.parse({ ...person, event_id: "" });
    expect(body).toHaveProperty("event_id", null);
  });

  it("a chosen show is sent as its id", () => {
    const id = "3f2c1e9a-1111-4222-8333-444455556666";
    expect(captureConfirm.parse({ ...person, event_id: id }).event_id).toBe(id);
  });
});

describe("in_person", () => {
  it("is a source and a channel, with labels", () => {
    expect(LEAD_SOURCES).toContain("in_person");
    expect(TOUCHPOINT_CHANNELS).toContain("in_person");
    expect(sourceLabel("in_person")).toBe("In person");
    expect(channelLabel("in_person")).toBe("In person");
  });

  it("an unknown value shows as readable text instead of blank", () => {
    expect(sourceLabel("trade_portal")).toBe("Trade portal");
    expect(channelLabel("carrier_pigeon")).toBe("Carrier pigeon");
    expect(sourceLabel(null)).toBe("—");
  });

  it("bulk import reads 'walk-in' and 'in person' as in_person", () => {
    const csv =
      "Name,Phone,Company,Source\nA B,+65 9123 4567,Co One,Walk-in\nC D,+65 9123 4568,Co Two,In person\n";
    const { records, headers } = parseCsv(csv);
    const rows = buildPayloads(records, headers).rows;
    expect(rows.map((r) => r.payload?.source)).toEqual([
      "in_person",
      "in_person",
    ]);
  });
});
