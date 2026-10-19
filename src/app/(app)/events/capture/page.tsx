import type { Metadata } from "next";
import { Suspense } from "react";
import { CaptureScreen } from "@/components/app/capture";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Capture at a show" };

export default function Page() {
  return (
    <RequirePermission permission="captures:write" what="capturing leads">
      {/* The screen reads ?event= from the URL. */}
      <Suspense>
        <CaptureScreen />
      </Suspense>
    </RequirePermission>
  );
}
