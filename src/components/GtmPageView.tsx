"use client";

import { sendGTMEvent } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function GtmPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pagePath = `${window.location.pathname}${window.location.search}`;

    sendGTMEvent({
      event: "page_view",
      page_location: window.location.href,
      page_path: pagePath,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
