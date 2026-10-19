import type { Metadata } from "next";
import { EnquiryForm } from "@/components/app/enquiry-form";
import { RequirePermission } from "@/components/app/access";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Log enquiry" };

export default function NewEnquiryPage() {
  return (
    <RequirePermission permission="leads:ingest" what="logging enquiries">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={{ href: "/leads", label: "Leads" }}
          title="Log an enquiry"
          description="For a walk-in or phone enquiry. It goes through the same duplicate check as every other channel."
        />
        <EnquiryForm />
      </div>
    </RequirePermission>
  );
}
