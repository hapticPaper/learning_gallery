"use client";

import { sendGTMEvent } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function GtmPageView() {
  const pathname = usePathname();
  // De-dupe `page_view` emissions across Strict Mode effect replays/remounts.
  const lastSentPagePath = useRef<string | null>(null);

  useEffect(() => {
    const pagePath = `${window.location.pathname}${window.location.search}`;

    if (lastSentPagePath.current === pagePath) return;
    lastSentPagePath.current = pagePath;

    sendGTMEvent({
      event: "page_view",
      page_location: window.location.href,
      page_path: pagePath,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
