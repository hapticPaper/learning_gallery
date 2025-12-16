"use client";

import { sendGTMEvent } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function GtmPageView() {
  const pathname = usePathname();

  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

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
