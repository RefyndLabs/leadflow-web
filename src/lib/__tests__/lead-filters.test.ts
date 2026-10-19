import { describe, expect, it } from "vitest";
import { buildQuery } from "../api/client";
import { countryFlag, dayStart, localMidnight } from "../format";
import {
  activeFilterCount,
  isView,
  quickViews,
  toApiQuery,
} from "../lead-filters";

const ME = "3f2c1e9a-1111-4222-8333-444455556666";
const EV = "3f2c1e9a-1111-4222-8333-444455556667";
const sp = (s: string) => new URLSearchParams(s);
// Mid-afternoon local time, so "today" never straddles midnight in any time zone the tests run in.
const NOW = new Date(2026, 9, 9, 15, 30);

describe("leads list URL → API query", () => {
  it("passes multi-value filters through as repeated keys", () => {
    const q = toApiQuery(
      sp(`stage=not_contacted&stage=contacted&event_id=${EV}&country=de&country=fr&region=europe`),
      ME,
      NOW,
    );
    expect(q).toEqual({
      stage: ["not_contacted", "contacted"],
      event_id: [EV],
      country: ["DE", "FR"],
      region: ["europe"],
    });
    expect(buildQuery(q)).toBe(
      "?stage=not_contacted&stage=contacted&event_id=" +
        EV +
        "&country=DE&country=FR&region=europe",
    );
  });

  it("resolves owner_id=me to the viewer and drops junk values", () => {
    expect(
      toApiQuery(sp("owner_id=me&owner_id=bogus&stage=nope&qualification=hot&sort=evil"), ME, NOW),
    ).toEqual({ owner_id: [ME], qualification: ["hot"] });
  });

  it("date presets are local-midnight ranges with an offset", () => {
    const today = toApiQuery(sp("created=today"), ME, NOW);
    expect(today.created_from).toBe(localMidnight(0, NOW));
    expect(today.created_to).toBe(localMidnight(1, NOW));
    expect(String(today.created_from)).toMatch(/T00:00:00[+-]\d{2}:\d{2}$/);

    expect(toApiQuery(sp("created=7d"), ME, NOW)).toEqual({
      created_from: localMidnight(-6, NOW),
    });

    // Custom range: both days inclusive, so `to` becomes the next day's midnight (exclusive).
    const custom = toApiQuery(
      sp("created=custom&created_from=2026-10-01&created_to=2026-10-05"),
      ME,
      NOW,
    );
    expect(custom.created_from).toBe(dayStart("2026-10-01"));
    expect(custom.created_to).toBe(dayStart("2026-10-06"));
  });

  it("follow-up presets", () => {
    expect(toApiQuery(sp("follow_up=overdue"), ME, NOW)).toEqual({
      follow_up_overdue: true,
    });
    expect(toApiQuery(sp("follow_up=none"), ME, NOW)).toEqual({
      has_follow_up: false,
    });
    expect(toApiQuery(sp("follow_up=7d"), ME, NOW)).toEqual({
      follow_up_from: localMidnight(0, NOW),
      follow_up_to: localMidnight(7, NOW),
    });
  });

  it("search needs two characters; has_event and score bounds are validated", () => {
    expect(toApiQuery(sp("q=a"), ME, NOW)).toEqual({});
    expect(
      toApiQuery(sp("q=anna&has_event=false&score_min=40&score_max=900"), ME, NOW),
    ).toEqual({ q: "anna", has_event: "false", score_min: 40 });
  });

  it("counts active filters and recognises saved views", () => {
    expect(activeFilterCount(sp("stage=won&stage=lost&created=7d&sort=name_asc"))).toBe(3);
    const [mine] = quickViews();
    expect(isView(sp("owner_id=me&follow_up=overdue"), mine!.params)).toBe(true);
    expect(isView(sp("owner_id=me&follow_up=overdue&stage=won"), mine!.params)).toBe(false);
    expect(quickViews(EV).map((v) => v.key)).toContain("this-show");
  });
});

describe("format helpers", () => {
  it("country flags are only drawn for two-letter codes", () => {
    expect(countryFlag("se")).toBe("🇸🇪");
    expect(countryFlag("")).toBe("");
    expect(countryFlag("SWE")).toBe("");
  });
});

describe("bulk import: v2 columns", () => {
  it("maps WhatsApp, country, website and export details; enum-ish cells are normalised", async () => {
    const { buildPayloads, parseCsv } = await import("../import");
    const csv =
      "Name,Email,Company,Source,WhatsApp,Country,Website,Buyer type,Incoterm,Quality\n" +
      "Anna Berg,anna@nordic.example,Nordic Herbs AB,Website,+46 70 123 4567,se,nordic.example,Brand owner,cif,Hot\n";
    const { records, headers } = parseCsv(csv);
    const sheet = buildPayloads(records, headers);
    expect(sheet.ignored).toEqual([]);
    expect(sheet.rows[0]!.errors).toEqual([]);
    expect(sheet.rows[0]!.payload).toMatchObject({
      contact_whatsapp: "+46 70 123 4567",
      account_country: "SE",
      account_website: "https://nordic.example",
      buyer_type: "brand_owner",
      incoterm: "CIF",
      quality_tag: "hot",
    });
  });
});
