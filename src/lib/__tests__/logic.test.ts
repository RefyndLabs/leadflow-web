import { describe, expect, it } from "vitest";
import { ApiError, describeError, parseErrorBody } from "../api/errors";
import { buildQuery } from "../api/client";
import { safeNext } from "../next-url";
import { manualTransitions, railIndex } from "../status";
import { buildPayloads, parseCsv, templateCsv } from "../import";
import { formatMoney, safeHttpUrl, telHref } from "../format";
import { can } from "../permissions";
import { parseAttributes } from "../product-import";

describe("error parsing", () => {
  const h = (init: Record<string, string> = {}) => new Headers(init);

  it("handles FastAPI string details", () => {
    const e = parseErrorBody(
      409,
      { detail: "An organization must keep at least one active admin" },
      h(),
    );
    expect(e.detail).toBe(
      "An organization must keep at least one active admin",
    );
    expect(e.status).toBe(409);
  });

  it("handles FastAPI validation arrays and strips the 'Value error' prefix", () => {
    const e = parseErrorBody(
      422,
      {
        detail: [
          {
            loc: ["body", "new_password"],
            msg: "Value error, Password is too common",
          },
        ],
      },
      h(),
    );
    expect(e.fields).toEqual([
      { path: "new_password", message: "Password is too common" },
    ]);
  });

  it("captures the request id from body or header, and Retry-After", () => {
    expect(
      parseErrorBody(500, { detail: "x", request_id: "abc" }, h()).requestId,
    ).toBe("abc");
    expect(
      parseErrorBody(500, {}, h({ "x-request-id": "hdr" })).requestId,
    ).toBe("hdr");
    const e = parseErrorBody(429, {}, h({ "retry-after": "12" }));
    expect(e.retryAfter).toBe(12);
    expect(describeError(e)).toContain("12s");
  });

  it("falls back to friendly defaults", () => {
    expect(parseErrorBody(403, null, h()).detail).toMatch(/permission/);
    expect(describeError(new Error("boom"))).toMatch(/Something went wrong/);
    expect(
      describeError(
        new ApiError({ status: 500, detail: "Oops", requestId: "r1" }),
      ),
    ).toContain("r1");
  });
});

describe("query building", () => {
  it("skips empty values", () => {
    expect(buildQuery({ a: "1", b: "", c: null, d: undefined, e: 0 })).toBe(
      "?a=1&e=0",
    );
    expect(buildQuery({})).toBe("");
  });
});

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/leads?status=stale", "/leads?status=stale"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/login", "/"],
    ["/api/lf/leads", "/"],
    [null, "/"],
    ["", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input as string | null)).toBe(expected);
  });
});

describe("lead status machine", () => {
  it("only offers the manual transitions from the build guide", () => {
    expect(manualTransitions("in_conversation")).toEqual([
      "quotation_requested",
    ]);
    expect(manualTransitions("quotation_requested")).toEqual([
      "in_conversation",
      "won",
      "lost",
    ]);
  });
  it("offers nothing for automatic or terminal states", () => {
    for (const s of ["new", "uncontacted", "stale", "won", "lost"] as const)
      expect(manualTransitions(s)).toEqual([]);
  });
  it("places every status on the rail", () => {
    expect(railIndex("uncontacted")).toBe(0);
    expect(railIndex("stale")).toBe(1);
    expect(railIndex("lost")).toBe(2);
    expect(railIndex("won")).toBe(3);
  });
});

describe("permissions", () => {
  it("checks the live array, never the role", () => {
    expect(can({ permissions: ["leads:read"] }, "leads:read")).toBe(true);
    expect(can({ permissions: ["leads:read"] }, "leads:write")).toBe(false);
    expect(can(null, "leads:read")).toBe(false);
  });
});

describe("formatting helpers", () => {
  it("only http(s) become links", () => {
    expect(safeHttpUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("s3://bucket/key")).toBeNull();
  });
  it("tel links keep only dialable characters", () => {
    expect(telHref("+91 (98765) 43210; rm -rf")).toBe("tel:+919876543210");
  });
  it("formats money, tolerating bad currency codes", () => {
    expect(formatMoney(1200, "USD")).toContain("1,200");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(() => formatMoney(5, "not-a-code")).not.toThrow();
  });
});

describe("bulk import parsing", () => {
  it("maps friendly headers, validates each row and reports problems", () => {
    const csv =
      "Name,Phone,Company,Source,Notes\nAsha Rao,+91 98765 43210,Rao Textiles,Website,Wants cotton yarn\nBad Row,12,,nonsense,\n";
    const { records, headers } = parseCsv(csv);
    const sheet = buildPayloads(records, headers);
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows[0]!.payload).toMatchObject({
      contact_name: "Asha Rao",
      account_name: "Rao Textiles",
      source: "website",
      touchpoint: {
        direction: "inbound",
        channel: "website",
        content: "Wants cotton yarn",
      },
    });
    expect(sheet.rows[1]!.payload).toBeNull();
    expect(sheet.rows[1]!.errors.length).toBeGreaterThan(0);
  });

  it("flags missing required columns and ignores unknown ones", () => {
    const { records, headers } = parseCsv("Name,Favourite colour\nAsha,blue\n");
    const sheet = buildPayloads(records, headers);
    expect(sheet.missing).toEqual(
      expect.arrayContaining(["contact_phone", "account_name", "source"]),
    );
    expect(sheet.ignored).toEqual(["Favourite colour"]);
  });

  it("the downloadable template parses cleanly", () => {
    const { records, headers } = parseCsv(templateCsv());
    const sheet = buildPayloads(records, headers);
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows[0]!.errors).toEqual([]);
  });
});

describe("variant attributes", () => {
  it("parses key: value lines", () => {
    expect(parseAttributes("size: 10 kg\ngrade = A")).toEqual({
      value: { size: "10 kg", grade: "A" },
    });
    expect(parseAttributes("").value).toBeNull();
    expect(parseAttributes("nonsense").error).toBeTruthy();
    expect(parseAttributes("__proto__: x").error).toBeTruthy();
  });
});
