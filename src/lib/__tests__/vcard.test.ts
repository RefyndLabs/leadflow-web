import { describe, expect, it } from "vitest";
import {
  androidContactIntent,
  buildVCard,
  isAndroid,
  vcardFileName,
} from "../vcard";

const lines = (card: string) => card.split("\r\n");

describe("contact card (vCard 3.0)", () => {
  it("has the name, numbers, email, company and title", () => {
    const card = buildVCard({
      name: "Anna Maria Berg",
      phone: "+44 7700 900123",
      alternatePhone: "+44 20 7946 0000",
      whatsapp: "+44 7700 900999",
      email: "anna@nordicherbs.example",
      company: "Nordic Herbs AB",
      title: "Head of Sourcing",
      website: "https://nordicherbs.example",
      note: "Met at Tea & Spice Expo",
    });
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
    expect(lines(card)).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Berg;Anna Maria;;;",
      "FN:Anna Maria Berg",
      "ORG:Nordic Herbs AB",
      "TITLE:Head of Sourcing",
      "TEL;TYPE=CELL,VOICE:+447700900123",
      "TEL;TYPE=VOICE:+442079460000",
      "item3.TEL;TYPE=CELL:+447700900999",
      "item3.X-ABLabel:WhatsApp",
      "EMAIL;TYPE=INTERNET:anna@nordicherbs.example",
      "URL:https://nordicherbs.example",
      "NOTE:Met at Tea & Spice Expo",
      "END:VCARD",
      "",
    ]);
  });

  it("does not repeat a number (WhatsApp is usually the phone number)", () => {
    const card = buildVCard({
      name: "Luis",
      phone: "+34612345678",
      whatsapp: "+34 612 345 678",
    });
    expect(card.match(/TEL/g)).toHaveLength(1);
    expect(card).toContain("N:;Luis;;;");
  });

  it("escapes separators and folds long lines", () => {
    const card = buildVCard({
      name: "Omar",
      company: "Gulf Foods; Trading, LLC",
      note: "Line one\nline two " + "x".repeat(120),
    });
    expect(card).toContain("ORG:Gulf Foods\\; Trading\\, LLC");
    expect(card).toContain("NOTE:Line one\\nline two");
    for (const line of lines(card))
      expect(Array.from(line).length).toBeLessThanOrEqual(75);
    // Unfolding (removing CRLF + space) gives the original line back.
    expect(card.replace(/\r\n /g, "")).toContain("x".repeat(120));
  });

  it("makes a safe file name", () => {
    expect(vcardFileName("Anna Berg")).toBe("Anna Berg.vcf");
    expect(vcardFileName('a/b\\c:"d"')).toBe("abcd.vcf");
    expect(vcardFileName("   ")).toBe("contact.vcf");
  });
});

describe("Android: open Contacts with the details filled in", () => {
  it("builds an insert-contact intent with encoded extras", () => {
    const url = androidContactIntent({
      name: "Anna Berg",
      phone: "+44 7700 900123",
      alternatePhone: "+44 20 7946 0000",
      email: "anna@nordicherbs.example",
      company: "Nordic Herbs; AB",
      title: "Head of Sourcing",
    });
    expect(
      url.startsWith(
        "intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;",
      ),
    ).toBe(true);
    expect(url.endsWith(";end")).toBe(true);
    expect(url).toContain("S.name=Anna%20Berg");
    expect(url).toContain("S.phone=%2B447700900123");
    expect(url).toContain("S.secondary_phone=%2B442079460000");
    expect(url).toContain("S.email=anna%40nordicherbs.example");
    expect(url).toContain("S.company=Nordic%20Herbs%3B%20AB"); // a ";" can't end the extra early
    expect(url).toContain("S.job_title=Head%20of%20Sourcing");
    expect(url).toContain("i.phone_type=2");
  });

  it("leaves out what it doesn't have", () => {
    const url = androidContactIntent({
      name: "Mail Person",
      email: "m@example.com",
    });
    expect(url).not.toContain("S.phone");
    expect(url).not.toContain("phone_type");
  });

  it("recognises Android", () => {
    expect(
      isAndroid(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile",
      ),
    ).toBe(true);
    expect(
      isAndroid(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(false);
    expect(
      isAndroid("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126"),
    ).toBe(false);
  });
});
