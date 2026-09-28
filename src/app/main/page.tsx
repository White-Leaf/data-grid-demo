"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import isEqual from "lodash/isEqual";
import {
  DataGrid,
  DataGridContainer,
  DataGridScrollArea,
  DataGridTable,
  DataGridFilterMenu,
  InlineCellEditor,
  useDataGridTable,
} from "@/component/data-grid";
import type { DataGridColumnDef } from "@/component/data-grid/data-grid";
import {
  DATE_OPERATOR_LABELS,
  TEXT_OPERATOR_LABELS,
} from "@/sections/common-filters";
import {
  validateNumberFilter,
  validateTextFilter,
} from "@/sections/validation";
import type { ColumnFilterState } from "@/types/filter-types";
import type { TableRow } from "@/types/table-types";
import { cn } from "@/lib/utils";

const STATUS_VALUES = ["Active", "On Leave", "Inactive", "Pending"] as const;

const EDITABLE_COLUMNS = [
  "name",
  "email",
  "age",
  "salary",
  "department",
  "city",
  "status",
  "joinDate",
] as const;

type EditingCell = { rowId: string; columnId: string; initialDraft?: string };
type FilterMap = Record<string, ColumnFilterState | null>;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function filterType(columnId: string): "text" | "number" | "date" {
  if (["id", "age", "salary"].includes(columnId)) return "number";
  if (columnId === "joinDate") return "date";
  return "text";
}

function filterLabel(columnId: string, filter: ColumnFilterState) {
  if (filter.type === "text") {
    return `${columnId} ${TEXT_OPERATOR_LABELS[filter.operator].toLowerCase()}${
      filter.value ? `: ${filter.value}` : ""
    }`;
  }
  if (filter.type === "number") {
    return `${columnId} ${filter.operator} ${filter.value}`;
  }
  return filter.operator === "between"
    ? `${columnId}: ${filter.value} - ${filter.secondValue}`
    : `${columnId} ${DATE_OPERATOR_LABELS[filter.operator].toLowerCase()} ${
        filter.value
      }`;
}

function editConfig(columnId: string) {
  if (columnId === "age" || columnId === "salary") {
    return {
      editorType: "number" as const,
      options: undefined,
      parseValue: (raw: string) => Number(raw),
      validate: (value: unknown) =>
        validateNumberFilter("=", String(value)).error,
    };
  }
  if (columnId === "status") {
    return {
      editorType: "select" as const,
      options: STATUS_VALUES,
      parseValue: (raw: string) => raw,
      validate: (value: unknown) =>
        STATUS_VALUES.includes(String(value) as (typeof STATUS_VALUES)[number])
          ? null
          : "Status is invalid.",
    };
  }
  if (columnId === "joinDate") {
    return {
      editorType: "date" as const,
      options: undefined,
      parseValue: (raw: string) => raw,
      validate: (value: unknown) =>
        validDate(String(value)) ? null : "Use a valid YYYY-MM-DD date.",
    };
  }
  return {
    editorType: "text" as const,
    options: undefined,
    parseValue: (raw: string) => raw,
    validate: (value: unknown) =>
      columnId === "email"
        ? String(value).includes("@")
          ? null
          : "Please provide a valid email."
        : validateTextFilter("equals", String(value)).error,
  };
}

export default function MainTable() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [filters, setFilters] = useState<FilterMap>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(50);
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] =
    useState<HTMLDivElement | null>(null);

  const setTableContainer = useCallback((node: HTMLDivElement | null) => {
    tableContainerRef.current = node;
    setPortalContainer(node);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      filters: JSON.stringify(filters),
      sorting: JSON.stringify(sorting),
    });
    fetch(`/api/table-rows?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load rows.");
        return response.json() as Promise<{ data: TableRow[]; total: number }>;
      })
      .then((payload) => {
        setRows(payload.data);
        setRecordCount(payload.total);
        setMessage(null);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load rows.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [filters, pageIndex, pageSize, sorting]);

  const applyFilter = useCallback(
    (columnId: string, filter: ColumnFilterState | null) => {
      const next = { ...filters, [columnId]: filter };
      setIsLoading(true);
      setFilters(next);
      setColumnFilters(
        Object.entries(next)
          .filter(([, value]) => value)
          .map(([id, value]) => ({ id, value })),
      );
      setPageIndex(0);
      setOpenColumn(null);
    },
    [filters],
  );

  const saveCell = useCallback(
    async (row: TableRow, columnId: string, value: unknown) => {
      // Get the previous value before updating the cell value.
      const previous = row[columnId as keyof TableRow];

      // Do not trigger the API if the value has not changed.
      if (isEqual(previous, value)) {
        setEditingCell(null);
        return true;
      }

      // Optimistic update.
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? ({ ...item, [columnId]: value } as TableRow)
            : item,
        ),
      );

      try {
        const response = await fetch(
          `/api/table-rows/${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [columnId]: value }),
          },
        );

        if (!response.ok) {
          throw new Error("Unable to save the change.");
        }

        const payload = (await response.json()) as { data: TableRow };

        setRows((current) =>
          current.map((item) => (item.id === row.id ? payload.data : item)),
        );
        setEditingCell(null);
        setMessage(null);

        return true;
      } catch (error: unknown) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? ({ ...item, [columnId]: previous } as TableRow)
              : item,
          ),
        );
        setEditingCell(null);
        setMessage(
          error instanceof Error ? error.message : "Unable to save the change.",
        );

        return false;
      }
    },
    [],
  );

  const startEditingCell = useCallback(
    (rowId: string, columnId: string, initialDraft?: string) => {
      if (columnId !== "id") setEditingCell({ rowId, columnId, initialDraft });
    },
    [],
  );

  const getNextEditableCell = useCallback(
    (rowId: string, columnId: string, direction: "next" | "previous") => {
      const columnIndex = EDITABLE_COLUMNS.indexOf(
        columnId as (typeof EDITABLE_COLUMNS)[number],
      );

      if (columnIndex < 0) return null;

      const rowIndex = rows.findIndex((row) => row.id === rowId);

      if (rowIndex < 0) return null;

      if (direction === "next") {
        // Move to the next column in the same row.
        if (columnIndex < EDITABLE_COLUMNS.length - 1) {
          return {
            rowId,
            columnId: EDITABLE_COLUMNS[columnIndex + 1],
          };
        }

        // Last column: move to the first column of the next row.
        const nextRow = rows[rowIndex + 1];

        if (!nextRow) {
          return null;
        }

        return {
          rowId: nextRow.id,
          columnId: EDITABLE_COLUMNS[0],
        };
      }

      // Move to the previous column in the same row.
      if (columnIndex > 0) {
        return {
          rowId,
          columnId: EDITABLE_COLUMNS[columnIndex - 1],
        };
      }

      // First column: move to the last column of the previous row.
      const previousRow = rows[rowIndex - 1];

      if (!previousRow) {
        return null;
      }

      return {
        rowId: previousRow.id,
        columnId: EDITABLE_COLUMNS[EDITABLE_COLUMNS.length - 1],
      };
    },
    [rows],
  );

  const columns = useMemo<DataGridColumnDef<TableRow>[]>(
    () => [
      {
        id: "id",
        accessorKey: "id",
        header: "id",
        size: 80,
        enableSorting: true,
      },
      ...EDITABLE_COLUMNS.map((columnId) => {
        const config = editConfig(columnId);
        const type = filterType(columnId);
        return {
          id: columnId,
          accessorKey: columnId,
          size: columnId === "email" ? 220 : 150,
          enableSorting: true,
          meta: { cellEdit: { editable: true }, cellClassName: "relative !p-0" },
          header: () => {
            const isOpen = openColumn === columnId;
            return (
              <div className="relative -m-2 min-h-9 overflow-visible px-2 py-2">
                <button
                  type="button"
                  aria-label={`Filter ${columnId}`}
                  title={`Filter ${columnId}`}
                  className="group flex w-full items-center justify-between gap-2 text-left text-[11px] font-bold lowercase tracking-wide text-slate-700"
                  onClick={(event) => {
                    const buttonRect = event.currentTarget.getBoundingClientRect();
                    const tableContainer = tableContainerRef.current;

                    if (!tableContainer) return;

                    const tableRect = tableContainer.getBoundingClientRect();

                    const MENU_WIDTH = 224;
                    const PADDING = 8;
                    const GAP = 4;

                    const rawLeft =
                      buttonRect.left - tableRect.left + tableContainer.scrollLeft;

                    const top =
                      buttonRect.bottom -
                      tableRect.top +
                      tableContainer.scrollTop +
                      GAP;

                    const maxLeft =
                      tableContainer.clientWidth -
                      MENU_WIDTH -
                      PADDING +
                      tableContainer.scrollLeft;

                    const left = Math.max(
                      PADDING + tableContainer.scrollLeft,
                      Math.min(rawLeft, maxLeft),
                    );

                    setMenuPosition({ top, left });
                    setOpenColumn(isOpen ? null : columnId);
                  }}
                >
                  {columnId === "joinDate" ? "join date" : columnId}
                  <Filter
                    className={cn(
                      "size-3.5 transition",
                      isOpen
                        ? "text-blue-600"
                        : "text-slate-400 group-hover:text-blue-500",
                    )}
                  />
                </button>
                {isOpen && (
                  <DataGridFilterMenu
                    type={type}
                    value={filters[columnId] ?? null}
                    position={menuPosition}
                    portalContainer={portalContainer}
                    onApply={(filter) => applyFilter(columnId, filter)}
                    onClear={() => applyFilter(columnId, null)}
                  />
                )}
              </div>
            );
          },
          cell: ({ row, getValue }) => {
            const value = getValue();
            const isEditing =
              editingCell?.rowId === row.original.id &&
              editingCell?.columnId === columnId;
            if (isEditing) {
              return (
               <div className="absolute inset-0 z-10 box-border flex w-full items-center overflow-visible">
                <div className="pointer-events-none absolute inset-0 z-20 border-2 border-blue-500" />

                  <InlineCellEditor
                    key={`${row.original.id}-${columnId}`}
                    value={value as string | number}
                    initialDraft={editingCell.initialDraft ?? String(value ?? "")}
                    editorType={config.editorType}
                    options={config.options}
                    parseValue={config.parseValue}
                    validate={config.validate}
                    onCommit={(nextValue) =>
                      saveCell(row.original, columnId, nextValue)
                    }
                    onCancel={() => setEditingCell(null)}
                    onNavigate={(direction) => {
                      const nextCell = getNextEditableCell(
                        row.original.id,
                        columnId,
                        direction,
                      );

                      if (nextCell) {
                        startEditingCell(nextCell.rowId, nextCell.columnId);
                      } else {
                        setEditingCell(null);
                      }
                    }}
                  />
                </div>
              );
            }
            const display =
              columnId === "salary"
                ? `${Number(value).toLocaleString()}`
                : String(value ?? "");
            return (
              <button
                type="button"
                className="flex h-8 min-h-8 w-full items-center px-2 text-left text-sm leading-5 outline-none focus:outline-none focus-visible:bg-transparent focus-visible:ring-0"
                onMouseDown={(event) => {
                  if (event.button !== 0) return;

                  event.preventDefault();
                  startEditingCell(row.original.id, columnId);
                }}
              >
                {display}
              </button>
            );
          },
        } as DataGridColumnDef<TableRow>;
      }),
    ],
    [
      applyFilter,
      editingCell,
      filters,
      menuPosition,
      openColumn,
      saveCell,
      getNextEditableCell,
      startEditingCell,
      portalContainer,
    ],
  );

  const table = useDataGridTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    pageCount: Math.ceil(recordCount / pageSize),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    state: { columnFilters, sorting, pagination: { pageIndex, pageSize } },
    onSortingChange: (updater) => {
      setIsLoading(true);
      setSorting(updater);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize })
          : updater;
      setIsLoading(true);
      setPageIndex(next.pageIndex);
    },
  });

  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const activeFilterCount = activeFilters.length;

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] space-y-3">
        <div
          ref={setTableContainer}
          className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Employee directory
              </h1>
              <p className="text-xs text-slate-500">
                Use the filter icon to narrow rows. Click a cell to edit.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {message && (
                <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                  {message}
                </div>
              )}
              <div className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
                {activeFilterCount} active filter
                {activeFilterCount === 1 ? "" : "s"}
              </div>
              <button
                type="button"
                disabled={activeFilterCount === 0 || isLoading}
                onClick={() => {
                  setIsLoading(true);
                  setFilters({});
                  setColumnFilters([]);
                  setPageIndex(0);
                }}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear filters
              </button>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2.5 sm:px-5">
              {activeFilters.map(
                ([columnId, filter]) =>
                  filter && (
                    <div
                      key={columnId}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 pl-2.5 text-xs font-medium text-blue-800"
                    >
                      <span>{filterLabel(columnId, filter)}</span>
                      <button
                        type="button"
                        onClick={() => applyFilter(columnId, null)}
                        aria-label={`Remove ${columnId} filter`}
                        className="rounded-r-md p-1.5 text-blue-600 hover:bg-blue-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ),
              )}
            </div>
          )}
          <DataGrid
            table={table}
            recordCount={recordCount}
            isLoading={isLoading}
            tableLayout={{
              dense: false,
              cellBorder: true,
              rowBorder: true,
              columnsResizable: false,
              headerSticky: true,
            }}
          >
            <DataGridContainer className="border-0 bg-white">
              <DataGridScrollArea className="w-full overflow-hidden">
                <DataGridTable />
              </DataGridScrollArea>
            </DataGridContainer>
          </DataGrid>
        </div>
      </div>
    </main>
  );
}
