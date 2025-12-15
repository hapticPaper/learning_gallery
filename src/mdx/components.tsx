import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { Callout } from "@/components/mdx/Callout";
import { FlowDiagram } from "@/components/mdx/FlowDiagram";
import { SimpleLineChart } from "@/components/mdx/SimpleLineChart";
import { VideoEmbed } from "@/components/mdx/VideoEmbed";

export const mdxComponents = {
  a: MdxLink,
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
