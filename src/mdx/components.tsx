import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { Callout } from "@/components/mdx/Callout";
import { FlowDiagram } from "@/components/mdx/FlowDiagram";
import { SimpleLineChart } from "@/components/mdx/SimpleLineChart";
import { VideoEmbed } from "@/components/mdx/VideoEmbed";
import { withBasePath } from "@/lib/basePath";

export const mdxComponents = {
  a: MdxLink,
  img: MdxImage,
  Callout,
  FlowDiagram,
  SimpleLineChart,
  VideoEmbed,
};

function MdxLink(props: ComponentPropsWithoutRef<"a">) {
  const href = props.href;
  if (!href) return <a {...props} />;

  if (href.startsWith("/")) {
    return <Link href={href} {...props} />;
  }

  return <a target="_blank" rel="noreferrer" {...props} />;
}

function MdxImage(props: ComponentPropsWithoutRef<"img">) {
  const src = props.src;
  const alt = props.alt ?? "";
  if (!src || typeof src !== "string") return <img {...props} alt={alt} />;

  const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) || src.startsWith("//");
  if (isExternal || !src.startsWith("/")) {
    return <img {...props} alt={alt} />;
  }

  return <img {...props} alt={alt} src={withBasePath(src)} />;
}
