"use client";

import "reactflow/dist/style.css";

import { useEffect, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "reactflow";

import { cn } from "@/lib/cn";

export function FlowDiagram({
  nodes,
  edges,
  className,
}: {
  nodes: Node[];
  edges: Edge[];
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "not-prose my-6 h-[420px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "not-prose my-6 h-[420px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    >
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
