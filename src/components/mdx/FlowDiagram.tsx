"use client";

import "reactflow/dist/style.css";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "reactflow";

import { ClientOnly } from "@/components/ClientOnly";
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
  return (
    <div
      className={cn(
        "not-prose my-6 h-[420px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    >
      <ClientOnly
        fallback={
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Loading diagram…
          </div>
        }
      >
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ClientOnly>
    </div>
  );
}
