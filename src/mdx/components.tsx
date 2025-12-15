import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { Callout } from "@/components/mdx/Callout";
import { VideoEmbed } from "@/components/mdx/VideoEmbed";

const FlowDiagram = dynamic(
  () => import("@/components/mdx/FlowDiagram").then((mod) => mod.FlowDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="not-prose my-6 h-[420px] w-full rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950" />
    ),
  },
);

const SimpleLineChart = dynamic(
  () =>
    import("@/components/mdx/SimpleLineChart").then((mod) => mod.SimpleLineChart),
  {
    ssr: false,
    loading: () => (
      <div className="not-prose my-6 h-[320px] w-full rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950" />
    ),
  },
);

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
