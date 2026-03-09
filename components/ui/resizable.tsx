"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
      {...props}
    />
  );
}

const ResizablePanel = ResizablePrimitive.Panel;

function ResizableHandle({
  withHandle,
  className,
  handleClassName,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
  handleClassName?: string;
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(
        "group relative z-[1200] flex w-px cursor-col-resize items-center justify-center overflow-visible bg-border/80 transition-colors hover:bg-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-4 after:-translate-x-1/2 data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-4 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0",
        className
      )}
      {...props}
    >
      {withHandle ? (
        <div
          className={cn(
            "z-[1300] flex h-6 w-4 items-center justify-center rounded-md border border-border bg-background/95 shadow-sm transition-colors group-hover:border-foreground/30 group-hover:bg-background data-[panel-group-direction=vertical]:h-4 data-[panel-group-direction=vertical]:w-6",
            handleClassName
          )}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/80" />
        </div>
      ) : null}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };



