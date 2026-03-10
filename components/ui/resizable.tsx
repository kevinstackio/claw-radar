"use client";

import * as React from "react";
import { GripHorizontal, GripVertical } from "lucide-react";
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

type ResizableHandleProps = React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
  handleClassName?: string;
  handleIcon?: "vertical" | "horizontal";
};

function ResizableHandle({
  withHandle,
  className,
  handleClassName,
  handleIcon = "vertical",
  ...props
}: ResizableHandleProps) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      className={cn(
        "group relative z-[1200] flex w-px cursor-col-resize items-center justify-center overflow-visible bg-border/80 transition-colors duration-200 hover:bg-primary/60 group-hover:bg-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        "before:pointer-events-none before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-border/80 before:content-[''] before:transition-[width,height,background-color] before:duration-200",
        "hover:before:w-[2px] hover:before:bg-primary/60 group-hover:before:w-[2px] group-hover:before:bg-primary/60",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize",
        "data-[panel-group-direction=vertical]:before:left-0 data-[panel-group-direction=vertical]:before:top-1/2 data-[panel-group-direction=vertical]:before:h-px data-[panel-group-direction=vertical]:before:w-full data-[panel-group-direction=vertical]:before:-translate-y-1/2 data-[panel-group-direction=vertical]:before:translate-x-0",
        "data-[panel-group-direction=vertical]:hover:before:h-[2px] data-[panel-group-direction=vertical]:hover:before:w-full data-[panel-group-direction=vertical]:group-hover:before:h-[2px] data-[panel-group-direction=vertical]:group-hover:before:w-full",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-4 after:-translate-x-1/2 data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-4 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0",
        className
      )}
      {...props}
    >
      {withHandle ? (
        <div
          className={cn(
            "z-[1300] flex h-6 w-4 items-center justify-center rounded-sm border-2 border-border/80 bg-background/95 shadow-sm transition-colors duration-200 group-hover:border-primary/70 group-hover:bg-background",
            handleClassName
          )}
        >
          {handleIcon === "horizontal" ? (
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/80 transition-colors duration-200 group-hover:text-primary/90" />
          ) : (
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/80 transition-colors duration-200 group-hover:text-primary/90" />
          )}
        </div>
      ) : null}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
