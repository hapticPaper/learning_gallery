import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/70">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Learning Gallery
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/experiments">Experiments</NavLink>
          <NavLink href="/models">Models</NavLink>
          <NavLink href="/blueprints">Blueprints</NavLink>
          <NavLink href="/news">News</NavLink>
          <a
            className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            href="https://github.com/hapticPaper/learning_gallery"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
        "dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
      )}
    >
      {children}
    </Link>
  );
}
