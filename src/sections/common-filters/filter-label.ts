import type { ColumnFilterState } from "@/types/filter-types";
import { DATE_OPERATOR_LABELS } from "./date";
import { TEXT_OPERATOR_LABELS } from "./text";

export function formatFilterLabel(columnLabel: string, filter: ColumnFilterState) {
  if (filter.type === "text") {
    const operatorLabel = TEXT_OPERATOR_LABELS[filter.operator];
    const suffix = filter.value ? `: ${filter.value}` : "";
    return `${columnLabel} ${operatorLabel.toLowerCase()}${suffix}`;
  }

  if (filter.type === "number") {
    return `${columnLabel} ${filter.operator} ${filter.value}`;
  }

  return filter.operator === "between"
    ? `${columnLabel}: ${filter.value} - ${filter.secondValue ?? ""}`
    : `${columnLabel} ${DATE_OPERATOR_LABELS[filter.operator].toLowerCase()} ${filter.value}`;
}
