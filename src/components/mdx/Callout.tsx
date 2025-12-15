import { cn } from "@/lib/cn";

import type { ReactNode } from "react";

type CalloutType = "note" | "warn" | "tip";

const styles: Record<CalloutType, string> = {
  note: "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-50",
  tip: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-50",
  warn: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-50",
};

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "not-prose my-6 rounded-xl border px-4 py-3 text-sm",
        styles[type],
      )}
    >
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      <div className="leading-6 text-inherit">{children}</div>
    </aside>
  );
}
