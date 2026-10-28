"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { uploadCaptureFile } from "../capture-media";
import { api, apiList, newIdempotencyKey, type Query } from "./client";
import type {
  IgnoredSender,
  MessageTemplate,
  Account,
  ApiKey,
  ApiKeyCreated,
  AuditLog,
  BulkIngestResult,
  BulkProductResult,
  Cadence,
  Capture,
  CaptureConfirmResult,
  Collateral,
  Contact,
  CurrentEvents,
  DueLead,
  DuplicateCheck,
  EventRecord,
  EventSummary,
  IngestResult,
  Lead,
  LeadContext,
  LeadFacets,
  LeadListItem,
  LeadNote,
  LeadProduct,
  LeadStats,
  LibraryItem,
  MatchResult,
  Me,
  Mailbox,
  Organization,
  Outreach,
  Page,
  Product,
  ProductMatch,
  ProductVariant,
  Quotation,
  Regions,
  Research,
  SampleRequest,
  Touchpoint,
  User,
} from "./types";

export interface MutationOpts<T = unknown> {
  /** The caller renders errors itself (e.g. maps 422s onto form fields) — skip the global toast. */
  handled?: boolean;
  /** Toast shown on success. */
  success?: string;
  onSuccess?: (data: T) => void;
}

/* ── Query keys ─────────────────────────────────────────────────────────── */
export const keys = {
  me: ["me"] as const,
  stats: ["leads", "stats"] as const,
  due: ["cadences", "due"] as const,
};

/* ── Auth ───────────────────────────────────────────────────────────────── */
export function useMeQuery() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>("/auth/me"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/* ── Generic CRUD factory ───────────────────────────────────────────────── */
function crud<Read extends { id: string }, Create, Update = Partial<Create>>(
  path: string,
) {
  const key = path.replace(/^\//, "");
  const seed = (qc: QueryClient, items: Read[]) => {
    for (const item of items) qc.setQueryData([key, "one", item.id], item);
  };

  return {
    key,
    useList(query: Query = {}, options: { enabled?: boolean } = {}) {
      const qc = useQueryClient();
      return useQuery({
        queryKey: [key, "list", query],
        queryFn: async ({ signal }) => {
          const page = await apiList<Read>(path, query, signal);
          seed(qc, page.items);
          return page;
        },
        placeholderData: keepPreviousData,
        enabled: options.enabled ?? true,
      });
    },
    useOne(
      id: string | null | undefined,
      options: Partial<UseQueryOptions<Read>> = {},
    ) {
      return useQuery({
        queryKey: [key, "one", id],
        queryFn: ({ signal }) => api<Read>(`${path}/${id}`, { signal }),
        enabled: Boolean(id) && (options.enabled ?? true),
        staleTime: 60_000,
      });
    },
    useCreate(opts: MutationOpts<Read> = {}) {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (body: Create) => api<Read>(path, { method: "POST", body }),
        meta: { handled: opts.handled },
        onSuccess: (data) => {
          void qc.invalidateQueries({ queryKey: [key] });
          if (opts.success) toast.success(opts.success);
          opts.onSuccess?.(data);
        },
      });
    },
    useUpdate(opts: MutationOpts<Read> = {}) {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: ({ id, body }: { id: string; body: Update }) =>
          api<Read>(`${path}/${id}`, { method: "PATCH", body }),
        meta: { handled: opts.handled },
        onSuccess: (data, { id }) => {
          qc.setQueryData([key, "one", id], data);
          void qc.invalidateQueries({ queryKey: [key, "list"] });
          if (opts.success) toast.success(opts.success);
          opts.onSuccess?.(data);
        },
      });
    },
    useRemove(opts: MutationOpts<void> = {}) {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (id: string) =>
          api<void>(`${path}/${id}`, { method: "DELETE" }),
        meta: { handled: opts.handled },
        onSuccess: (_d, id) => {
          qc.removeQueries({ queryKey: [key, "one", id] });
          void qc.invalidateQueries({ queryKey: [key, "list"] });
          if (opts.success) toast.success(opts.success);
          opts.onSuccess?.();
        },
      });
    },
  };
}

export const accounts = crud<Account, Record<string, unknown>>("/accounts");
export const contacts = crud<Contact, Record<string, unknown>>("/contacts");
export const products = crud<Product, Record<string, unknown>>("/products");
export const collaterals = crud<Collateral, Record<string, unknown>>(
  "/collaterals",
);
export const catalogue = crud<LibraryItem, Record<string, unknown>>(
  "/catalogue",
);
export const faqs = crud<LibraryItem, Record<string, unknown>>("/faqs");
export const events = crud<EventRecord, Record<string, unknown>>("/events");
export const cadences = crud<Cadence, Record<string, unknown>>("/cadences");
export const messageTemplates = crud<MessageTemplate, Record<string, unknown>>(
  "/message-templates",
);
export const ignoredSenders = crud<IgnoredSender, Record<string, unknown>>(
  "/ignored-senders",
);
export const users = crud<User, Record<string, unknown>>("/users");
export const leads = crud<Lead, Record<string, unknown>>("/leads");
export const captures = crud<Capture, Record<string, unknown>>("/captures");

/* ── Leads ──────────────────────────────────────────────────────────────── */
const invalidateLead = (qc: QueryClient, id: string) => {
  void qc.invalidateQueries({ queryKey: ["leads", "list"] });
  void qc.invalidateQueries({ queryKey: ["leads", "context", id] });
  void qc.invalidateQueries({ queryKey: keys.stats });
  void qc.invalidateQueries({ queryKey: keys.due });
  void qc.invalidateQueries({ queryKey: ["leads", "one", id] });
};

const researching = (r: Research | null | undefined) =>
  r?.status === "requested" || r?.status === "processing";

/** A workflow is writing or sending the first message: the page waits for it. */
export const outreachBusy = (o: Outreach | null | undefined) =>
  o?.status === "requested" ||
  o?.status === "drafting" ||
  o?.status === "approved" ||
  o?.status === "sending";

/** The lead page in one call. Polls every 15 s while research or the first message is being worked on. */
export function useLeadContext(id: string) {
  return useQuery({
    queryKey: ["leads", "context", id],
    queryFn: ({ signal }) =>
      api<LeadContext>(`/leads/${id}/context`, { signal }),
    refetchInterval: (q) =>
      researching(q.state.data?.research) ||
      outreachBusy(q.state.data?.outreach)
        ? 15_000
        : false,
  });
}

export function useLeadStats(enabled = true) {
  return useQuery({
    queryKey: keys.stats,
    queryFn: ({ signal }) => api<LeadStats>("/leads/stats", { signal }),
    enabled,
  });
}

export function useDueCadences(enabled = true) {
  return useQuery({
    queryKey: keys.due,
    queryFn: ({ signal }) =>
      api<DueLead[]>("/cadences/due", { query: { limit: 500 }, signal }),
    enabled,
  });
}

export function useChangeStatus(leadId: string, opts: MutationOpts<Lead> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: string; reason?: string }) =>
      api<Lead>(`/leads/${leadId}/status`, { method: "PATCH", body }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      invalidateLead(qc, leadId);
      opts.onSuccess?.(data);
    },
    onError: () => invalidateLead(qc, leadId), // state may have changed under us (409) — refetch
  });
}

export function useScoreLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quality_tag: string) =>
      api<Lead>(`/leads/${leadId}/score`, {
        method: "POST",
        body: { quality_tag },
      }),
    onSuccess: () => invalidateLead(qc, leadId),
  });
}

export function useAssignLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (owner_id: string | null) =>
      api<Lead>(`/leads/${leadId}/assign`, {
        method: "POST",
        body: { owner_id },
      }),
    onSuccess: () => {
      invalidateLead(qc, leadId);
      toast.success("Owner updated");
    },
  });
}

export function useUpdateLead(leadId: string, opts: MutationOpts<Lead> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Lead>(`/leads/${leadId}`, { method: "PATCH", body }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      invalidateLead(qc, leadId);
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data);
    },
  });
}

/** Lets the WhatsApp bot (and automated follow-ups) resume after it handed the lead to a person. */
export function useResumeBot(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Lead>(`/leads/${leadId}/handoff`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateLead(qc, leadId);
      toast.success("The WhatsApp bot will reply to this lead again");
    },
  });
}

/** One idempotency key per form submission attempt; reused if the same submission is retried. */
export function useLogTouchpoint(
  leadId: string,
  opts: MutationOpts<Touchpoint> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      key,
    }: {
      body: Record<string, unknown>;
      key?: string;
    }) =>
      api<Touchpoint>(`/leads/${leadId}/touchpoints`, {
        method: "POST",
        body,
        idempotencyKey: key ?? newIdempotencyKey(),
      }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      invalidateLead(qc, leadId); // auto-transitions may have changed the status
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data);
    },
  });
}

export function useIngest(opts: MutationOpts<IngestResult> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      key,
    }: {
      body: Record<string, unknown>;
      key: string;
    }) =>
      api<IngestResult>("/leads/ingest", {
        method: "POST",
        body,
        idempotencyKey: key,
      }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      opts.onSuccess?.(data);
    },
  });
}

export function useBulkIngest(opts: MutationOpts<BulkIngestResult> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      rows,
      key,
    }: {
      rows: Record<string, unknown>[];
      key: string;
    }) =>
      api<BulkIngestResult>("/leads/bulk-ingest", {
        method: "POST",
        body: rows,
        idempotencyKey: key,
      }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      opts.onSuccess?.(data);
    },
  });
}

export function useSweepStale(opts: MutationOpts<Lead[]> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Lead[]>("/leads/sweep-stale", { method: "POST" }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.due });
      opts.onSuccess?.(data);
    },
  });
}

export function useMatch(
  params: { phone?: string; email?: string; company?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["leads", "match", params],
    queryFn: ({ signal }) =>
      api<MatchResult>("/leads/match", { query: params, signal }),
    enabled: enabled && Boolean(params.phone || params.email || params.company),
    staleTime: 15_000,
    retry: false,
  });
}

/* ── Quotations & samples (nested under a lead) ─────────────────────────── */
export function useQuotations(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ["leads", "quotations", leadId],
    queryFn: ({ signal }) =>
      api<Quotation[]>(`/leads/${leadId}/quotations`, { signal }),
    enabled,
  });
}

export function useQuotationMutations(leadId: string) {
  const qc = useQueryClient();
  const done = () =>
    void qc.invalidateQueries({ queryKey: ["leads", "quotations", leadId] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<Quotation>(`/leads/${leadId}/quotations`, { method: "POST", body }),
      meta: { handled: true },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Record<string, unknown>;
      }) =>
        api<Quotation>(`/leads/${leadId}/quotations/${id}`, {
          method: "PATCH",
          body,
        }),
      meta: { handled: true },
      onSuccess: done,
    }),
    decide: useMutation({
      mutationFn: ({
        id,
        decision,
      }: {
        id: string;
        decision: "approve" | "reject";
      }) =>
        api<Quotation>(`/leads/${leadId}/quotations/${id}/${decision}`, {
          method: "POST",
        }),
      onSuccess: (_d, v) => {
        done();
        toast.success(
          v.decision === "approve"
            ? "Quotation approved"
            : "Quotation rejected",
        );
      },
    }),
  };
}

export function useSamples(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ["leads", "samples", leadId],
    queryFn: ({ signal }) =>
      api<SampleRequest[]>(`/leads/${leadId}/sample-requests`, { signal }),
    enabled,
  });
}

export function useSampleMutations(leadId: string) {
  const qc = useQueryClient();
  const done = () =>
    void qc.invalidateQueries({ queryKey: ["leads", "samples", leadId] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<SampleRequest>(`/leads/${leadId}/sample-requests`, {
          method: "POST",
          body,
        }),
      meta: { handled: true },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Record<string, unknown>;
      }) =>
        api<SampleRequest>(`/leads/${leadId}/sample-requests/${id}`, {
          method: "PATCH",
          body,
        }),
      meta: { handled: true },
      onSuccess: done,
    }),
  };
}

/* ── Products: variants + bulk ──────────────────────────────────────────── */
export function useVariants(productId: string) {
  return useQuery({
    queryKey: ["products", "variants", productId],
    queryFn: ({ signal }) =>
      api<ProductVariant[]>(`/products/${productId}/variants`, { signal }),
  });
}

export function useVariantMutations(productId: string) {
  const qc = useQueryClient();
  const done = () =>
    void qc.invalidateQueries({
      queryKey: ["products", "variants", productId],
    });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<ProductVariant>(`/products/${productId}/variants`, {
          method: "POST",
          body,
        }),
      meta: { handled: true },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (variantId: string) =>
        api<void>(`/products/${productId}/variants/${variantId}`, {
          method: "DELETE",
        }),
      onSuccess: () => {
        done();
        toast.success("Variant deleted");
      },
    }),
  };
}

export function useBulkProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Record<string, unknown>[]) =>
      api<BulkProductResult>("/products/bulk", { method: "POST", body: rows }),
    meta: { handled: true },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

/* ── Team ───────────────────────────────────────────────────────────────── */
export function useUserMutations() {
  const qc = useQueryClient();
  return {
    resetPassword: useMutation({
      mutationFn: ({
        id,
        new_password,
      }: {
        id: string;
        new_password: string;
      }) =>
        api<void>(`/users/${id}/reset-password`, {
          method: "POST",
          body: { new_password },
        }),
      meta: { handled: true },
    }),
    revokeSessions: useMutation({
      mutationFn: (id: string) =>
        api<void>(`/users/${id}/revoke-sessions`, { method: "POST" }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["users"] });
        toast.success("Signed out everywhere");
      },
    }),
  };
}

/* ── API keys ───────────────────────────────────────────────────────────── */
export function useApiKeys() {
  return useQuery({
    queryKey: ["service-api-keys"],
    queryFn: ({ signal }) =>
      apiList<ApiKey>("/service-api-keys", { limit: 200 }, signal),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ApiKeyCreated>("/service-api-keys", { method: "POST", body }),
    meta: { handled: true },
    gcTime: 0, // the one-time secret must not linger in the mutation cache
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["service-api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/service-api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["service-api-keys"] });
      toast.success("Key revoked");
    },
  });
}

/* ── Organization & audit ───────────────────────────────────────────────── */
export function useOrganization(enabled = true) {
  return useQuery({
    queryKey: ["organization"],
    queryFn: ({ signal }) => api<Organization>("/organization", { signal }),
    enabled,
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Organization>("/organization", { method: "PATCH", body }),
    meta: { handled: true },
    onSuccess: (data) => {
      qc.setQueryData(["organization"], data);
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success("Settings saved");
    },
  });
}

/* ── Email (Settings → Email) ───────────────────────────────────────────── */
export function useMailboxes() {
  return useQuery({
    queryKey: ["email", "mailboxes"],
    queryFn: ({ signal }) => api<Mailbox[]>("/email/mailboxes", { signal }),
  });
}

/** Asks the API for Google's consent screen and sends the browser there; Google brings it back to this page. */
export function useConnectGmail() {
  return useMutation({
    mutationFn: () =>
      api<{ authorization_url: string }>("/email/mailboxes/google/authorize", {
        method: "POST",
      }),
    onSuccess: ({ authorization_url }) => {
      window.location.assign(authorization_url);
    },
  });
}

/** Ticks show at once (they are plain on/off settings); a refused change is put back when the list reloads. */
export function useUpdateMailbox() {
  const qc = useQueryClient();
  const key = ["email", "mailboxes"];
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api<Mailbox>(`/email/mailboxes/${id}`, { method: "PATCH", body }),
    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Mailbox[]>(key, (rows) =>
        rows?.map((m) =>
          m.id === id
            ? { ...m, ...body }
            : body.is_default_sender
              ? { ...m, is_default_sender: false }
              : m,
        ),
      );
    },
    onSuccess: () => toast.success("Mailbox updated"),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDisconnectMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/email/mailboxes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email", "mailboxes"] });
      toast.success("Mailbox disconnected");
    },
  });
}

export function useAuditLogs(query: Query) {
  return useQuery({
    queryKey: ["audit-logs", query],
    queryFn: ({ signal }) => apiList<AuditLog>("/audit-logs", query, signal),
    placeholderData: keepPreviousData,
  });
}

export type { Page };

/* ── Captures (booth photo + voice note) ────────────────────────────────── */
const isReading = (c: Capture | undefined) =>
  c?.status === "submitted" || c?.status === "processing";

/** One capture; polls every 5 s while it is being read so the review form fills itself in. */
export function useCapture(id: string) {
  return useQuery({
    queryKey: ["captures", "one", id],
    queryFn: ({ signal }) => api<Capture>(`/captures/${id}`, { signal }),
    refetchInterval: (q) => (isReading(q.state.data) ? 5000 : false),
  });
}

/** The queue; refetches every 15 s while any row is still being read. */
export function useCaptureQueue(query: Query, enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["captures", "list", query],
    queryFn: async ({ signal }) => {
      const page = await apiList<Capture>("/captures", query, signal);
      for (const c of page.items) qc.setQueryData(["captures", "one", c.id], c);
      return page;
    },
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: (q) =>
      q.state.data?.items.some(isReading) ? 15_000 : false,
  });
}

export function useCaptureActions(id: string) {
  const qc = useQueryClient();
  const refresh = (c?: Capture) => {
    if (c) qc.setQueryData(["captures", "one", id], c);
    void qc.invalidateQueries({ queryKey: ["captures", "list"] });
  };
  return {
    submit: useMutation({
      mutationFn: () =>
        api<Capture>(`/captures/${id}/submit`, { method: "POST" }),
      meta: { handled: true },
      onSuccess: refresh,
    }),
    discard: useMutation({
      mutationFn: () =>
        api<Capture>(`/captures/${id}/discard`, { method: "POST" }),
      meta: { handled: true },
      onSuccess: refresh,
    }),
    confirm: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<CaptureConfirmResult>(`/captures/${id}/confirm`, {
          method: "POST",
          body,
        }),
      meta: { handled: true },
      onSuccess: (r) => {
        refresh(r.capture);
        void qc.invalidateQueries({ queryKey: ["leads"] });
        void qc.invalidateQueries({ queryKey: ["contacts"] });
        void qc.invalidateQueries({ queryKey: ["accounts"] });
        void qc.invalidateQueries({ queryKey: ["events"] });
      },
    }),
  };
}

/**
 * Adds, replaces or removes the photo of the back of the card on an existing capture. Either change
 * sends the capture back to draft (the API clears the extraction), so the capture is re-read afterwards.
 */
export function useCardBack(id: string) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: ["captures", "one", id] });
    void qc.invalidateQueries({ queryKey: ["captures", "list"] });
  };
  return {
    upload: useMutation({
      mutationFn: ({
        photo,
        onProgress,
      }: {
        photo: Blob;
        onProgress?: (fraction: number) => void;
      }) =>
        uploadCaptureFile(id, "card-back", photo, "card-back.jpg", onProgress),
      meta: { handled: true },
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: () =>
        api<void>(`/captures/${id}/card-back`, { method: "DELETE" }),
      meta: { handled: true },
      onSettled: settle,
    }),
  };
}

/**
 * Re-runs the duplicate check as the reviewer edits (debounced by the caller). Never re-fetches the
 * capture itself — that would reset the form. Omitted values fall back to the extraction.
 */
export function useCaptureDuplicates(
  id: string,
  params: Query,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["captures", "duplicates", id, params],
    queryFn: ({ signal }) =>
      api<DuplicateCheck>(`/captures/${id}/duplicates`, {
        query: params,
        signal,
      }),
    enabled,
    staleTime: 15_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/* ── Duplicate check for the manual "New lead" form ─────────────────────── */
export function useLeadDuplicates(params: Query, enabled: boolean) {
  return useQuery({
    queryKey: ["leads", "duplicates", params],
    queryFn: ({ signal }) =>
      api<DuplicateCheck>("/leads/duplicates", { query: params, signal }),
    enabled,
    staleTime: 15_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/* ── Leads list: overview rows, facet counts, regions ───────────────────── */
export function useLeadOverview(query: Query) {
  return useQuery({
    queryKey: ["leads", "overview", query],
    queryFn: ({ signal }) =>
      apiList<LeadListItem>("/leads/overview", query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useLeadFacets(query: Query) {
  return useQuery({
    queryKey: ["leads", "facets", query],
    queryFn: ({ signal }) =>
      api<LeadFacets>("/leads/facets", { query, signal }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useRegions() {
  return useQuery({
    queryKey: ["leads", "regions"],
    queryFn: ({ signal }) => api<Regions>("/leads/regions", { signal }),
    staleTime: Infinity,
  });
}

/* ── Lead page: products, notes, research ───────────────────────────────── */
export function useSetLeadProducts(
  leadId: string,
  opts: MutationOpts<LeadProduct[]> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      products: {
        product_id: string;
        quantity?: string | null;
        note?: string | null;
      }[],
    ) =>
      api<LeadProduct[]>(`/leads/${leadId}/products`, {
        method: "PUT",
        body: { products },
      }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      invalidateLead(qc, leadId);
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data);
    },
  });
}

export function useLeadNoteMutations(leadId: string) {
  const qc = useQueryClient();
  // A promise with a due date can move the lead's next follow-up, so the whole lead is refreshed.
  const done = () => invalidateLead(qc, leadId);
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api<LeadNote>(`/leads/${leadId}/notes`, { method: "POST", body }),
      meta: { handled: true },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: Record<string, unknown>;
      }) =>
        api<LeadNote>(`/leads/${leadId}/notes/${id}`, {
          method: "PATCH",
          body,
        }),
      meta: { handled: true },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        api<void>(`/leads/${leadId}/notes/${id}`, { method: "DELETE" }),
      onSuccess: () => {
        done();
        toast.success("Note deleted");
      },
    }),
  };
}

export function useRequestResearch(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refresh: boolean) =>
      api<Research>(`/leads/${leadId}/research`, {
        method: "POST",
        body: refresh ? { refresh: true } : {},
      }),
    onSuccess: (run) => {
      invalidateLead(qc, leadId);
      void qc.invalidateQueries({ queryKey: ["leads", "research", leadId] });
      toast.success(
        run.status === "completed"
          ? "Research is already up to date"
          : "Research requested — usually takes a few minutes",
      );
    },
  });
}

/** Every research run on a lead, newest first (the "previous results" drawer). */
export function useResearchHistory(leadId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["leads", "research", leadId],
    queryFn: ({ signal }) =>
      api<Research[]>(`/leads/${leadId}/research`, { signal }),
    enabled,
  });
}

/* ── Lead page: the personalised first message ──────────────────────────── */
type OutreachText = {
  whatsapp_text?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
};

/** Ask for, edit, approve, send by hand, rewrite, retry or cancel the lead's first message. */
export function useOutreachActions(leadId: string) {
  const qc = useQueryClient();
  const done = () => invalidateLead(qc, leadId);
  const post = (id: string, action: string, body?: unknown) =>
    api<Outreach>(`/outreach/${id}/${action}`, { method: "POST", body });
  return {
    request: useMutation({
      mutationFn: (body: { instructions?: string; again?: boolean }) =>
        api<Outreach>(`/leads/${leadId}/first-touch`, { method: "POST", body }),
      onSuccess: done,
    }),
    save: useMutation({
      mutationFn: ({ id, body }: { id: string; body: OutreachText }) =>
        api<Outreach>(`/outreach/${id}`, { method: "PATCH", body }),
      meta: { handled: true },
      onSuccess: done,
    }),
    approve: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: OutreachText & { channel: "whatsapp" | "email" };
      }) => post(id, "approve", body),
      meta: { handled: true },
      onSuccess: done,
    }),
    markSent: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: string;
        body: OutreachText & { channel: "whatsapp" | "email" };
      }) => post(id, "mark-sent", body),
      meta: { handled: true },
      onSuccess: done,
    }),
    redraft: useMutation({
      mutationFn: ({
        id,
        instructions,
      }: {
        id: string;
        instructions?: string;
      }) => post(id, "redraft", instructions ? { instructions } : {}),
      onSuccess: done,
    }),
    retry: useMutation({
      mutationFn: (id: string) => post(id, "retry"),
      onSuccess: done,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => post(id, "cancel"),
      onSuccess: done,
    }),
  };
}

/* ── Catalogue: match-as-you-type and categories ────────────────────────── */
export function useProductMatch(q: string, enabled = true) {
  return useQuery({
    queryKey: ["products", "match", q],
    queryFn: ({ signal }) =>
      api<ProductMatch[]>("/products/match", {
        query: { q, limit: 5 },
        signal,
      }),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useProductCategories(enabled = true) {
  return useQuery({
    queryKey: ["products", "categories"],
    queryFn: ({ signal }) => api<string[]>("/products/categories", { signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/* ── Exhibitions: current show, team, performance ───────────────────────── */
/** Today's date in the person's own time zone, as the API's `on=` expects (YYYY-MM-DD). */
export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useCurrentEvents(enabled = true) {
  const on = localToday();
  return useQuery({
    queryKey: ["events", "current", on],
    queryFn: ({ signal }) =>
      api<CurrentEvents>("/events/current", { query: { on }, signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useEventSummary(id: string, enabled = true) {
  return useQuery({
    queryKey: ["events", "summary", id],
    queryFn: ({ signal }) =>
      api<EventSummary>(`/events/${id}/summary`, { signal }),
    enabled,
  });
}

/** Replaces the whole team of a show (`PUT /events/{id}/members`). */
export function useSetEventMembers(
  id: string,
  opts: MutationOpts<EventRecord> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (members: { user_id: string; role?: string | null }[]) =>
      api<EventRecord>(`/events/${id}/members`, {
        method: "PUT",
        body: { members },
      }),
    meta: { handled: opts.handled },
    onSuccess: (data) => {
      qc.setQueryData(["events", "one", id], data);
      void qc.invalidateQueries({ queryKey: ["events"] });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data);
    },
  });
}
