import type { LeadStatus } from "./api/types";

/**
 * Manual status changes a person may make via PATCH /leads/{id}/status (build guide §6).
 * Everything else happens automatically when a touchpoint is logged (uncontacted →
 * in_conversation on outbound, stale → in_conversation on inbound) or via the stale sweep,
 * so those deliberately have no buttons here — they would only fight the automation.
 */
export const MANUAL_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: [],
  uncontacted: [],
  in_conversation: ["quotation_requested"],
  quotation_requested: ["in_conversation", "won", "lost"],
  stale: [],
  won: [],
  lost: [],
};

export function manualTransitions(from: LeadStatus): readonly LeadStatus[] {
  return MANUAL_TRANSITIONS[from];
}

export function isTerminal(status: LeadStatus): boolean {
  return status === "won" || status === "lost";
}

/** The forward path shown as the lead's progress rail. `stale` and `lost` are side branches. */
export const PIPELINE: readonly LeadStatus[] = [
  "uncontacted",
  "in_conversation",
  "quotation_requested",
  "won",
];

/** Position of a status on the rail (0-based); stale sits with in_conversation, lost with quotation. */
export function railIndex(status: LeadStatus): number {
  switch (status) {
    case "new":
    case "uncontacted":
      return 0;
    case "in_conversation":
    case "stale":
      return 1;
    case "quotation_requested":
    case "lost":
      return 2;
    case "won":
      return 3;
  }
}

/** Human explanation of why an action isn't offered from this state. */
export function statusHint(status: LeadStatus): string {
  switch (status) {
    case "new":
    case "uncontacted":
      return "Moves to In conversation automatically once you log an outbound message.";
    case "stale":
      return "Moves back to In conversation automatically when the lead replies.";
    case "won":
    case "lost":
      return "This lead is closed.";
    default:
      return "";
  }
}
