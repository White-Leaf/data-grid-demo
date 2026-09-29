import type { EditableDataGridColumn } from "@/components/data-grid";
import { validateDateFilter } from "@/sections/validation";
import type { TableRow } from "@/types/table-types";

export const STATUS_VALUES = [
  "Active",
  "On Leave",
  "Inactive",
  "Pending",
] as const;

export type TableColumnConfig = {
  id: keyof TableRow;
  label: string;
  size: number;
  sortable: boolean;
  filterable: boolean;
  filterType?: "text" | "number" | "date";
  editable?: boolean;
  editorType?: EditableDataGridColumn<TableRow>["editorType"];
  options?: readonly string[];
  parseValue?: EditableDataGridColumn<TableRow>["parseValue"];
  formatValue?: EditableDataGridColumn<TableRow>["formatValue"];
  validate?: EditableDataGridColumn<TableRow>["validate"];
  displayValue?: (value: unknown) => string;
};

function validateEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? null
    : "Please enter a valid email address.";
}

function validateStatus(value: unknown) {
  return typeof value === "string" &&
    STATUS_VALUES.some((status) => status === value)
    ? null
    : "Please choose a valid status.";
}

function validateJoinDate(value: unknown) {
  return typeof value === "string"
    ? validateDateFilter("on", value).error
    : "Please select a valid date.";
}

export const ID_COLUMN_CONFIG = {
  id: "id",
  label: "id",
  size: 80,
  sortable: true,
  filterable: false,
  filterType: "number",
} satisfies TableColumnConfig;

export const TABLE_COLUMN_CONFIG: readonly TableColumnConfig[] = [
  ID_COLUMN_CONFIG,
  {
    id: "name",
    label: "name",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "text",
    editable: true,
    editorType: "text",
  },
  {
    id: "email",
    label: "email",
    size: 220,
    sortable: true,
    filterable: true,
    filterType: "text",
    editable: true,
    editorType: "text",
    validate: validateEmail,
  },
  {
    id: "age",
    label: "age",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "number",
    editable: true,
    editorType: "number",
  },
  {
    id: "salary",
    label: "salary",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "number",
    editable: true,
    editorType: "number",
    displayValue: (value: unknown) => Number(value).toLocaleString(),
  },
  {
    id: "department",
    label: "department",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "text",
    editable: true,
    editorType: "text",
  },
  {
    id: "city",
    label: "city",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "text",
    editable: true,
    editorType: "text",
  },
  {
    id: "status",
    label: "status",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "text",
    editable: true,
    editorType: "select",
    options: STATUS_VALUES,
    validate: validateStatus,
  },
  {
    id: "joinDate",
    label: "join date",
    size: 150,
    sortable: true,
    filterable: true,
    filterType: "date",
    editable: true,
    editorType: "date",
    validate: validateJoinDate,
  },
];

export const EDITOR_COLUMNS: EditableDataGridColumn<TableRow>[] =
  TABLE_COLUMN_CONFIG.flatMap((column) => {
    if (!column.editable || !column.editorType) {
      return [];
    }

    return [
      {
        id: column.id,
        editorType: column.editorType,
        options: column.options,
        parseValue: column.parseValue,
        formatValue: column.formatValue,
        validate: column.validate,
      },
    ];
  });

export function getColumnLabel(columnId: string) {
  return (
    TABLE_COLUMN_CONFIG.find((column) => column.id === columnId)?.label ??
    columnId
  );
}
