import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataGridRowPinButtonProps {
  pinned: boolean;
  onTogglePin: () => void;
  className?: string;
  label?: string;
}

export function DataGridRowPinButton({
  pinned,
  onTogglePin,
  className,
  label,
}: DataGridRowPinButtonProps) {
  return (
    <button
      type="button"
      aria-label={label ?? (pinned ? "Unpin row" : "Pin row")}
      title={label ?? (pinned ? "Unpin row" : "Pin row")}
      onClick={(event) => {
        event.stopPropagation();
        onTogglePin();
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-full transition-colors",
        pinned && "text-primary hover:text-primary/80",
        className,
      )}
    >
      {pinned ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <path d="M16 2l4.585 4.586-2.122 2.121L17.05 7.293l-3.535 3.536 1.413 5.658-2.12 2.121-4.244-4.243L4.322 18.6l-1.414-1.41 4.242-4.244-4.243-4.243 2.122-2.121 5.656 1.414 3.536-3.536-1.414-1.414z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z" />
        </svg>
      )}
    </button>
  );
}
