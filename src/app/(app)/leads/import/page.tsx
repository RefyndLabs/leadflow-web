import type { Metadata } from "next";
import { BulkImport } from "@/components/app/bulk-import";
import { RequirePermission } from "@/components/app/access";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Import leads" };

export default function ImportPage() {
  return (
    <RequirePermission permission="leads:ingest" what="importing leads">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          back={{ href: "/leads", label: "Leads" }}
          title="Import leads"
          description="Bring in historical or spreadsheet leads. Each row goes through the same duplicate check as a live enquiry."
        />
        <BulkImport />
      </div>
    </RequirePermission>
  );
}
