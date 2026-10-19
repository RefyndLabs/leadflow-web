import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ZodObject } from "zod";
import * as s from "../schemas";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  QUALITY_TAGS,
  TOUCHPOINT_CHANNELS,
  USER_ROLES,
} from "../enums";
import * as E from "../enums";
import { GRANTABLE_KEY_SCOPES } from "../permissions";

/**
 * Drift guard: the API rejects unknown fields with 422 and requires others, so every write schema
 * must expose exactly the property names of its OpenAPI counterpart, and the enum lists must match.
 * When the API changes: re-export openapi.json, run `pnpm gen:api`, and this test tells you what moved.
 */
const spec = JSON.parse(
  readFileSync(new URL("../../../openapi.json", import.meta.url), "utf8"),
) as {
  components: {
    schemas: Record<
      string,
      {
        properties?: Record<string, unknown>;
        required?: string[];
        enum?: string[];
      }
    >;
  };
};
const api = spec.components.schemas;

const keys = (z: ZodObject) => Object.keys(z.shape).sort();
const props = (name: string) => Object.keys(api[name]!.properties ?? {}).sort();

const PAIRS: [string, ZodObject][] = [
  ["LoginRequest", s.loginPayload],
  ["ChangePasswordRequest", s.changePasswordPayload],
  ["AccountCreate", s.accountCreate],
  ["AccountUpdate", s.accountUpdate],
  ["ContactCreate", s.contactCreate],
  ["ContactUpdate", s.contactUpdate],
  ["LeadCreate", s.leadCreate],
  ["LeadUpdate", s.leadUpdate],
  ["LeadStatusUpdate", s.leadStatusUpdate],
  ["LeadScoreUpdate", s.leadScoreUpdate],
  ["LeadAssignUpdate", s.leadAssignUpdate],
  ["TouchpointCreate", s.touchpointCreate],
  ["IngestTouchpoint", s.ingestTouchpoint],
  ["LeadIngestRequest", s.leadIngest],
  ["QuotationCreate", s.quotationCreate],
  ["QuotationUpdate", s.quotationUpdate],
  ["SampleRequestCreate", s.sampleCreate],
  ["SampleRequestUpdate", s.sampleUpdate],
  ["ProductCreate", s.productCreate],
  ["ProductUpdate", s.productUpdate],
  ["ProductVariantCreate", s.variantCreate],
  ["CollateralCreate", s.collateralCreate],
  ["CollateralUpdate", s.collateralUpdate],
  ["LibraryItemCreate", s.libraryItemCreate],
  ["LibraryItemUpdate", s.libraryItemUpdate],
  ["EventCreate", s.eventCreate],
  ["EventUpdate", s.eventUpdate],
  ["CadenceCreate", s.cadenceCreate],
  ["UserCreate", s.userCreate],
  ["UserUpdate", s.userUpdate],
  ["AdminPasswordReset", s.passwordReset],
  ["ApiKeyCreate", s.apiKeyCreate],
  ["OrganizationUpdate", s.organizationUpdate],
  ["CaptureCreate", s.captureCreate],
  ["CaptureUpdate", s.captureUpdate],
  ["CaptureConfirmRequest", s.captureConfirm],
  ["CadenceUpdate", s.cadenceUpdate],
  ["LeadNoteCreate", s.leadNoteCreate],
  ["LeadNoteUpdate", s.leadNoteUpdate],
  ["LeadProductIn", s.leadProductIn],
  ["LeadProductsUpdate", s.leadProductsUpdate],
  ["EventMemberIn", s.eventMemberIn],
  ["EventMembersUpdate", s.eventMembersUpdate],
  ["ResearchRequest", s.researchRequest],
];

describe("Zod schemas mirror the OpenAPI write schemas", () => {
  it.each(PAIRS)("%s has exactly the API's fields", (name, schema) => {
    expect(keys(schema)).toEqual(props(name));
  });

  it("required fields in the API are required in the form schemas", () => {
    const required = (name: string) => api[name]!.required ?? [];
    for (const [name, schema] of PAIRS) {
      // Update schemas allow the form to send everything, so only check the create side.
      if (
        !name.endsWith("Create") &&
        ![
          "LeadIngestRequest",
          "LoginRequest",
          "ChangePasswordRequest",
        ].includes(name)
      )
        continue;
      for (const field of required(name)) {
        const shape = schema.shape[field]!;
        // A required API field must not silently accept `undefined`.
        expect(shape.safeParse(undefined).success, `${name}.${field}`).toBe(
          false,
        );
      }
    }
  });
});

describe("enums match the API", () => {
  it("LeadSource", () =>
    expect([...LEAD_SOURCES].sort()).toEqual(
      [...api.LeadSource!.enum!].sort(),
    ));
  it("TouchpointChannel", () =>
    expect([...TOUCHPOINT_CHANNELS].sort()).toEqual(
      [...api.TouchpointChannel!.enum!].sort(),
    ));
  it("LeadStatus", () =>
    expect([...LEAD_STATUSES].sort()).toEqual(
      [...api.LeadStatus!.enum!].sort(),
    ));
  it("LeadQualityTag", () =>
    expect([...QUALITY_TAGS].sort()).toEqual(
      [...api.LeadQualityTag!.enum!].sort(),
    ));
  it("UserRole", () =>
    expect([...USER_ROLES].sort()).toEqual([...api.UserRole!.enum!].sort()));
  it.each([
    ["BuyerType", E.BUYER_TYPES],
    ["RequirementType", E.REQUIREMENT_TYPES],
    ["ContactChannel", E.CONTACT_CHANNELS],
    ["LeadNoteKind", E.LEAD_NOTE_KINDS],
    ["LeadProductSource", E.LEAD_PRODUCT_SOURCES],
    ["ResearchStatus", E.RESEARCH_STATUSES],
  ] as const)("%s", (name, values) =>
    expect([...values].sort()).toEqual([...api[name]!.enum!].sort()),
  );

  it("every grantable API-key scope is a real permission, and none of the human-only ones is offered", () => {
    const all = new Set(api.Permission!.enum);
    for (const scope of GRANTABLE_KEY_SCOPES)
      expect(all.has(scope), scope).toBe(true);
    for (const humanOnly of [
      "quotations:approve",
      "accounts:delete",
      "contacts:delete",
      "users:write",
      "keys:manage",
      "audit:read",
      "org:write",
      "catalog:write",
      "events:write",
      "cadences:write",
    ]) {
      expect(
        (GRANTABLE_KEY_SCOPES as readonly string[]).includes(humanOnly),
        humanOnly,
      ).toBe(false);
    }
  });
});

describe("field helpers", () => {
  it("blank optional text is omitted; blank on PATCH becomes null", () => {
    expect(
      s.accountCreate.parse({
        name: " Acme ",
        domain: "  ",
        industry: "",
        location: "",
      }),
    ).toEqual({ name: "Acme" });
    expect(
      s.accountUpdate.parse({
        name: "Acme",
        domain: "",
        industry: "x",
        location: "",
      }),
    ).toEqual({ name: "Acme", domain: null, industry: "x", location: null });
  });

  it("phone must look like a phone number", () => {
    expect(s.optionalPhone.safeParse("+91 98765-43210").success).toBe(true);
    expect(s.optionalPhone.safeParse("12").success).toBe(false);
    expect(s.optionalPhone.safeParse("call me").success).toBe(false);
    expect(s.optionalPhone.safeParse("").success).toBe(true);
  });

  it("only http(s) links are accepted for file URLs", () => {
    expect(s.optionalUrl().safeParse("javascript:alert(1)").success).toBe(
      false,
    );
    expect(s.optionalUrl().safeParse("https://example.com/a.pdf").success).toBe(
      true,
    );
    expect(s.optionalUrl().safeParse("").success).toBe(true);
  });

  it("parses comma separated tags, deduplicated", () => {
    expect(s.parseTags("a, b ,a,,c")).toEqual(["a", "b", "c"]);
    expect(s.parseTags("  ")).toBeUndefined();
  });

  it("quotation currency is upper-cased and validated", () => {
    expect(
      s.quotationCreate.parse({ amount: "1200.50", currency: "usd" }),
    ).toMatchObject({ amount: 1200.5, currency: "USD" });
    expect(
      s.quotationCreate.safeParse({ amount: "1", currency: "dollars" }).success,
    ).toBe(false);
  });

  it("lead ingest drops the touchpoint when omitted and rejects unknown fields", () => {
    const ok = s.leadIngest.parse({
      contact_name: "A",
      contact_phone: "+91 98765 43210",
      account_name: "B",
      source: "website",
    });
    expect(ok).not.toHaveProperty("touchpoint");
    expect(
      s.leadIngest.safeParse({
        contact_name: "A",
        contact_phone: "+91 98765 43210",
        account_name: "B",
        source: "website",
        bogus: 1,
      }).success,
    ).toBe(false);
    expect(
      s.leadIngest.safeParse({
        contact_name: "A",
        contact_phone: "+91 98765 43210",
        account_name: "B",
        source: "referral",
        touchpoint: { direction: "inbound", channel: "referral" },
      }).success,
    ).toBe(false); // referral is not a channel
  });

  it("lost requires a reason", () => {
    expect(
      s.leadLostUpdate.safeParse({ status: "lost", reason: "  " }).success,
    ).toBe(false);
    expect(
      s.leadLostUpdate.safeParse({
        status: "lost",
        reason: "Went with a competitor",
      }).success,
    ).toBe(true);
  });

  it("api key needs at least one scope and never a human-only one", () => {
    expect(s.apiKeyCreate.safeParse({ name: "n8n", scopes: [] }).success).toBe(
      false,
    );
    expect(
      s.apiKeyCreate.safeParse({ name: "n8n", scopes: ["users:write"] })
        .success,
    ).toBe(false);
    expect(
      s.apiKeyCreate.safeParse({ name: "n8n", scopes: ["leads:ingest"] })
        .success,
    ).toBe(true);
  });
});

describe("capture v2 field helpers", () => {
  it("export details: blanks are omitted on create and cleared on PATCH", () => {
    const created = s.leadIngest.parse({
      contact_name: "A",
      contact_email: "a@example.com",
      account_name: "B",
      source: "exhibition",
      buyer_type: "",
      samples_requested: "yes",
      incoterm: " cif ",
      account_country: "de",
      account_website: "nordicherbs.example",
    });
    expect(created.buyer_type).toBeUndefined(); // dropped by JSON.stringify
    expect(created).toMatchObject({
      samples_requested: true,
      incoterm: "CIF",
      account_country: "DE",
      account_website: "https://nordicherbs.example",
    });
    expect(
      s.leadUpdate.parse({ buyer_type: "", samples_requested: "no" }),
    ).toEqual({ buyer_type: null, samples_requested: false });
    // Only the keys a screen sends reach the API.
    expect(s.leadUpdate.parse({ follow_ups_paused: true })).toEqual({
      follow_ups_paused: true,
    });
  });

  it("datetime-local input is sent as an instant", () => {
    const out = s.leadNoteCreate.parse({
      kind: "commitment",
      body: "Send COA",
      due_at: "2026-10-12T09:00",
    });
    expect(out.due_at).toBe(new Date("2026-10-12T09:00").toISOString());
  });

  it("capture confirm: 'none' owner means unassigned, blank leaves the default", () => {
    const base = {
      contact_name: "A",
      contact_email: "a@example.com",
      account_name: "B",
      lead_resolution: "new",
    };
    expect(s.captureConfirm.parse({ ...base, owner_id: s.UNASSIGNED }).owner_id).toBeNull();
    expect(s.captureConfirm.parse({ ...base, owner_id: "" }).owner_id).toBeUndefined();
  });

  it("an exhibition can't end before it starts", () => {
    expect(
      s.eventCreate.safeParse({ name: "X", date: "2026-10-08", end_date: "2026-10-07" }).success,
    ).toBe(false);
    expect(
      s.eventCreate.safeParse({ name: "X", date: "2026-10-08", end_date: "2026-10-11", country: "in" }).success,
    ).toBe(true);
  });
});
