"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import isEqual from "lodash/isEqual";
import { cn } from "@/lib/utils";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type InlineCellEditorType = "text" | "number" | "select" | "date";
export type InlineCellEditorNavigation = "next" | "previous";

export type InlineCellEditorProps<TValue = string> = {
  value: TValue; // The current value of the cell being edited.
  editorType?: InlineCellEditorType;
  initialDraft?: string; // Initial text displayed in the editor.
  options?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  parseValue?: (raw: string) => TValue; // Converts raw string input into the expected type.
  formatValue?: (value: TValue) => string;
  validate?: (value: TValue) => string | null;
  onCommit: (value: TValue) => void | Promise<boolean | void>; // Sends the edited value back to the parent.
  onCancel?: () => void;
  onNavigate?: (direction: InlineCellEditorNavigation) => void;
  selectTextOnFocus?: boolean;
};

function defaultFormatValue<TValue>(value: TValue): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

// Converts a stored date string into a JavaScript Date object.
function toDatePickerValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function fromDatePickerValue(value: Date | undefined): string {
  if (!value) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getDate()).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid value.";
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="px-2 text-[10px] font-medium text-red-600">{message}</div>
  );
}

export function InlineCellEditor<TValue = string>({
  value,
  editorType = "text",
  initialDraft,
  options = [],
  placeholder,
  disabled = false,
  className,
  parseValue,
  formatValue = defaultFormatValue,
  validate,
  onCommit,
  onCancel,
  onNavigate,
}: InlineCellEditorProps<TValue>) {
  const [draft, setDraft] = useState<string>(
    initialDraft ?? formatValue(value),
  );

  const [error, setError] = useState<string | null>(null);

 const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
 const editorRef = useRef<HTMLDivElement | null>(null);

  // Store the original value when editing begins.
  const originalValueRef = useRef<TValue>(value);
  const isCommittingRef = useRef(false);

  useEffect(() => {
  if (inputRef.current) {
    inputRef.current.focus();
    return;
  }

  const focusable = editorRef.current?.querySelector<HTMLElement>(
    'button, input, select, [tabindex]:not([tabindex="-1"])',
  );

  focusable?.focus();
}, []);

  const resolveValue = (nextDraft: string): TValue => {
    if (parseValue) return parseValue(nextDraft);

    if (editorType === "number") {
      const numeric = Number(nextDraft);
      if (nextDraft.trim() === "" || !Number.isFinite(numeric)) {
        throw new Error("Please enter a valid number.");
      }
      return numeric as TValue;
    }

    if (editorType === "date") {
      return nextDraft as TValue;
    }

    return nextDraft as TValue;
  };

  const commitParsedValue = async (
    parsed: TValue,
    direction?: InlineCellEditorNavigation,
  ) => {
    // Check whether the value has actually changed.
    if (isEqual(parsed, originalValueRef.current)) {
      setError(null);

      // Navigate without triggering an API request.
      if (direction) {
        onNavigate?.(direction);
      } else {
        onCancel?.();
      }

      return;
    }

    const validationError = validate ? validate(parsed) : null;

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);

      const committed = await onCommit(parsed);

      // Update the original value only after a successful commit.
      if (committed !== false) {
        originalValueRef.current = parsed;

        if (direction) {
          onNavigate?.(direction);
        }
      }
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const commitValue = async (direction?: InlineCellEditorNavigation) => {
    if (isCommittingRef.current) return;

    isCommittingRef.current = true;

    try {
      const parsed = resolveValue(draft);

      await commitParsedValue(parsed, direction);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      isCommittingRef.current = false;
    }
  };

  const commitDraftValue = (nextDraft: string) => {
    setDraft(nextDraft);

    try {
      const parsed = resolveValue(nextDraft);

      void commitParsedValue(parsed);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setError(null);
      onCancel?.();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void commitValue("next");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      void commitValue(event.shiftKey ? "previous" : "next");
      return;
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    void commitValue();
  };

  const sharedInputClasses = cn(
    "box-border h-auto w-full min-w-0 border-0 bg-transparent px-2 text-sm text-slate-900 outline-none shadow-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
    className,
  );
  const editorWrapperClasses = cn(
    "relative flex h-full min-h-8 w-full items-center",
    className,
  );

  if (editorType === "select") {
    return (
      <div ref={editorRef} className={editorWrapperClasses}>
        <Select
          value={draft}
          onValueChange={(nextValue) => commitDraftValue(nextValue ?? "")}
          disabled={disabled}
        >
          <SelectTrigger
            size="sm"
            className={cn(
              "h-7 w-full rounded-none border-0 px-2 text-sm shadow-none",
              className,
            )}
            onKeyDown={handleKeyDown}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ErrorMessage message={error} />
      </div>
    );
  }

  if (editorType === "date") {
    return (
      <div ref={editorRef} className={editorWrapperClasses}>
        <DatePickerInput
          value={toDatePickerValue(draft)}
          popoverAlign="end"
          onValueChange={(nextValue) =>
            commitDraftValue(fromDatePickerValue(nextValue))
          }
          formatPreset="iso"
          size="sm"
          placeholder="Select date"
          clearable={false}
          triggerOnKeyDown={handleKeyDown}
          triggerClassName="h-full min-h-7 w-full rounded-none border-0 px-2 text-sm shadow-none"
          className="h-full w-full"
        />
        <ErrorMessage message={error} />
      </div>
    );
  }

  return (
    <div className={editorWrapperClasses}>
      <div className="flex min-h-[28px] w-full items-center">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={editorType === "number" ? "number" : "text"}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          className={sharedInputClasses}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          step={editorType === "number" ? "any" : undefined}
        />
      </div>

      <ErrorMessage message={error} />
    </div>
  );
}
