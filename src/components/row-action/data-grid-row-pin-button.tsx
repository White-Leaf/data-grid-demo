import * as React from "react";
import { PinIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataGridPinPosition } from "@/models/data-grid-row-state.model";
import { cn } from "@/lib/utils";

export interface DataGridRowPinButtonProps {
  pinPosition: DataGridPinPosition | null;
  onPinChange: (pinPosition: DataGridPinPosition | null) => void;
  className?: string;
  label?: string;
}

export function DataGridRowPinButton({
  pinPosition,
  onPinChange,
  className,
  label,
}: DataGridRowPinButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={label ?? (pinPosition ? `Row pinned to ${pinPosition}` : "Pin row")}
            title={label ?? (pinPosition ? `Row pinned to ${pinPosition}` : "Pin row")}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-full transition-colors",
              pinPosition && "text-primary hover:text-primary/80",
              className,
            )}
          >
            <PinIcon className="size-4" aria-hidden="true" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuItem onClick={() => onPinChange("top")}>Pin to top</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPinChange("bottom")}>Pin to bottom</DropdownMenuItem>
        {pinPosition && (
          <DropdownMenuItem onClick={() => onPinChange(null)}>Unpin row</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
