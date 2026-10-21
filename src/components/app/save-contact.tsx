"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  androidContactIntent,
  buildVCard,
  isAndroid,
  vcardFileName,
  type ContactCardInput,
} from "@/lib/vcard";
import { Button } from "@/components/ui/button";

function downloadCard(card: ContactCardInput) {
  const blob = new Blob([buildVCard(card)], {
    type: "text/vcard;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = vcardFileName(card.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves the person to the phone's (or computer's) contacts.
 *  - Android: opens Contacts' "new contact" screen with name, number(s), email,
 *    company and job title filled in, ready to save.
 *  - iPhone, laptop, desktop: downloads a contact card (.vcf). On an iPhone it
 *    opens in Contacts; on a computer it opens in Outlook / Apple Contacts, or
 *    can be imported into Google Contacts (and from there syncs to the phone).
 */
export function SaveContactButton({ card }: { card: ContactCardInput }) {
  // Android only: a way out if the Contacts app didn't open (some in-app browsers block intents).
  const [offerFile, setOfferFile] = React.useState(false);
  const save = () => {
    if (isAndroid(navigator.userAgent)) {
      window.location.href = androidContactIntent(card);
      setOfferFile(true);
      return;
    }
    downloadCard(card);
    toast.success("Contact card downloaded", {
      description:
        "Open it to add to your contacts, or import it into Google Contacts or Outlook.",
    });
  };
  return (
    <>
      <Button variant="secondary" size="sm" onClick={save}>
        <UserPlus aria-hidden />
        Save contact
      </Button>
      {offerFile && (
        <button
          type="button"
          onClick={() => downloadCard(card)}
          className="basis-full text-left text-[13px] text-accent hover:underline"
        >
          Contacts didn&apos;t open? Download the contact card instead
        </button>
      )}
    </>
  );
}
