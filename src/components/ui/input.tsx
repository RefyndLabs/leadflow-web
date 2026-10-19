import * as React from "react";
import { ChevronsUpDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] text-foreground placeholder:text-muted transition-colors hover:border-foreground/40 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-11 sm:h-9", className)} {...props} />;
}

/** Password field with a show/hide toggle. All props (id, aria-*) land on the <input> so labels stay wired. */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        className={cn(control, "h-11 pr-12 sm:h-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-0 top-0 grid size-11 place-items-center rounded-r-[10px] text-muted hover:text-foreground sm:size-9"
      >
        {shown ? (
          <EyeOff className="size-[18px]" aria-hidden />
        ) : (
          <Eye className="size-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * Native select: best-in-class on phones (system picker) and fully keyboard accessible on desktop.
 *
 * Options often arrive after mount (loaded from the API by a child component). React does not
 * re-apply a controlled `value` when only the options change, so a select whose value matches an
 * option that shows up late would render blank. Watching for option changes and re-applying the
 * value fixes that for every select in the app.
 */
export function Select({
  className,
  children,
  value,
  ref: outerRef,
  ...props
}: React.ComponentProps<"select">) {
  const ref = React.useRef<HTMLSelectElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLSelectElement | null) => {
      ref.current = node;
      if (typeof outerRef === "function") outerRef(node);
      else if (outerRef) outerRef.current = node;
    },
    [outerRef],
  );
  const latest = React.useRef(value);
  React.useEffect(() => {
    latest.current = value;
  }, [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const want = latest.current;
      if (want !== undefined && want !== null && el.value !== String(want))
        el.value = String(want);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      <select
        ref={setRefs}
        value={value}
        className={cn(control, "h-11 appearance-none pr-9 sm:h-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronsUpDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}

export function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors checked:border-accent checked:bg-accent checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.4%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3.5 8.5l3 3 6-7%22/></svg>')] checked:bg-center checked:bg-no-repeat disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
