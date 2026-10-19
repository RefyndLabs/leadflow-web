import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          404
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
          That page doesn&apos;t exist
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          It may have moved, or the link is wrong.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center rounded-[10px] bg-accent px-5 text-[15px] font-medium text-accent-fg sm:h-9"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
