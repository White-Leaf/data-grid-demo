"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { Search } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_OPERATORS,
  DATE_OPERATOR_LABELS,
  NUMERIC_OPERATORS,
  TEXT_OPERATORS,
  TEXT_OPERATOR_LABELS,
} from "@/sections/common-filters";
import {
  validateDateFilter,
  validateNumberFilter,
  validateTextFilter,
} from "@/sections/validation";
import type {
  ColumnFilterState,
  DateOperator,
  NumericOperator,
  TextOperator,
} from "@/types/filter-types";

export type DataGridFilterType = "text" | "number" | "date";

export interface DataGridFilterMenuProps {
  type: DataGridFilterType;
  value: ColumnFilterState | null;
  position: { top: number; left: number };
  portalContainer: HTMLDivElement | null;
  onApply: (filter: ColumnFilterState) => void;
  onClear: () => void;
}

function toDate(value: string) {
  return validateDateFilter("on", value).valid
    ? new Date(`${value}T00:00:00`)
    : undefined;
}

function fromDate(value: Date | undefined) {
  if (!value) return "";
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

// Shared operator dropdown used by all three filter types — only the
// option list and label lookup differ between them.
function OperatorSelect<TOperator extends string>({
  value,
  operators,
  labelFor,
  onChange,
}: {
  value: TOperator;
  operators: readonly TOperator[];
  labelFor: (operator: TOperator) => string;
  onChange: (operator: TOperator) => void;
}) {
  return (
    <Select value={value} onValueChange={(operator) => onChange(operator as TOperator)}>
      <SelectTrigger size="sm" className="mb-2 h-8 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[200]">
        {operators.map((operator) => (
          <SelectItem key={operator} value={operator}>
            {labelFor(operator)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DataGridFilterMenu({
  type,
  value,
  position,
  portalContainer,
  onApply,
  onClear,
}: DataGridFilterMenuProps) {
  const initial: ColumnFilterState =
    value ??
    (type === "text"
      ? { type: "text", operator: "contains", value: "" }
      : type === "number"
        ? { type: "number", operator: ">", value: "" }
        : { type: "date", operator: "on", value: "", secondValue: "" });

  const [draft, setDraft] = useState<ColumnFilterState>(initial);
  const [error, setError] = useState<string | null>(null);

  const text =
    draft.type === "text"
      ? draft
      : { type: "text" as const, operator: "contains" as const, value: "" };
  const number =
    draft.type === "number"
      ? draft
      : { type: "number" as const, operator: ">" as const, value: "" };
  const date =
    draft.type === "date"
      ? draft
      : {
          type: "date" as const,
          operator: "on" as const,
          value: "",
          secondValue: "",
        };

  // Merge a partial change into the current draft and clear any error,
  // used by every field's onChange handler below.
  const updateDraft = (patch: Partial<ColumnFilterState>) => {
    setDraft({ ...draft, ...patch } as ColumnFilterState);
    setError(null);
  };

  const apply = () => {
    const result =
      type === "text"
        ? validateTextFilter(text.operator, text.value)
        : type === "number"
          ? validateNumberFilter(number.operator, number.value)
          : validateDateFilter(date.operator, date.value, date.secondValue);

    if (!result.valid) {
      setError(result.error);
      return;
    }
    setError(null);
    onApply(draft);
  };

  if (!portalContainer) return null;

  return createPortal(
    <div
      style={{ top: position.top, left: position.left }}
      className="absolute z-50 w-56 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-xl shadow-foreground/10"
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Filter
      </div>

      {type === "text" && (
        <>
          <OperatorSelect<TextOperator>
            value={text.operator}
            operators={TEXT_OPERATORS}
            labelFor={(operator) => TEXT_OPERATOR_LABELS[operator]}
            onChange={(operator) => updateDraft({ ...text, operator })}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              disabled={text.operator === "blank" || text.operator === "notBlank"}
              value={text.value}
              onChange={(event) =>
                updateDraft({ ...text, value: event.target.value })
              }
              placeholder="Search..."
              className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:bg-muted"
            />
          </div>
        </>
      )}

      {type === "number" && (
        <>
          <OperatorSelect<NumericOperator>
            value={number.operator}
            operators={NUMERIC_OPERATORS}
            labelFor={(operator) => operator}
            onChange={(operator) => updateDraft({ ...number, operator })}
          />
          <input
            type="number"
            value={number.value}
            onChange={(event) =>
              updateDraft({ ...number, value: event.target.value })
            }
            placeholder="Enter value"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </>
      )}

      {type === "date" && (
        <>
          <OperatorSelect<DateOperator>
            value={date.operator}
            operators={DATE_OPERATORS}
            labelFor={(operator) => DATE_OPERATOR_LABELS[operator]}
            onChange={(operator) => updateDraft({ ...date, operator })}
          />
          <DatePickerInput
            value={toDate(date.value)}
            popoverAlign="end"
            onValueChange={(next) =>
              updateDraft({ ...date, value: fromDate(next) })
            }
            formatPreset="iso"
            size="sm"
            placeholder="Select date"
            triggerClassName="h-8 text-xs"
          />
          {date.operator === "between" && (
            <DatePickerInput
              value={toDate(date.secondValue ?? "")}
              popoverAlign="end"
              onValueChange={(next) =>
                updateDraft({ ...date, secondValue: fromDate(next) })
              }
              formatPreset="iso"
              size="sm"
              placeholder="Select end date"
              triggerClassName="mt-2 h-8 text-xs"
            />
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-xs leading-4 text-destructive">{error}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onClear}
          className="h-8 flex-1 rounded-md border border-input text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={apply}
          className="h-8 flex-1 rounded-md bg-primary text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Apply
        </button>
      </div>
    </div>,
    portalContainer,
  );
}
