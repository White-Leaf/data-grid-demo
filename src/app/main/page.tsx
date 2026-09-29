"use client";

import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";

import {
  DataGrid,
  DataGridContainer,
  DataGridScrollArea,
  DataGridTable,
  useServerDataGrid,
} from "@/components/data-grid";
import type {
  DataGridFetchParams,
  DataGridFetchResult,
  EditableDataGridCellSaveParams,
} from "@/components/data-grid";

import {
  DATE_OPERATOR_LABELS,
  TEXT_OPERATOR_LABELS,
} from "@/sections/common-filters";
import type { ColumnFilterState } from "@/types/filter-types";
import type { TableRow } from "@/types/table-types";

import { EDITOR_COLUMNS, getColumnLabel } from "@/app/main/table-config";
import {
  buildEmployeeColumns,
  type EmployeeColumnPresentationContext,
} from "@/app/main/employee-columns";

const getEmployeeRowId = (row: TableRow) => row.id;

function filterLabel(columnLabel: string, filter: ColumnFilterState) {
  if (filter.type === "text") {
    return `${columnLabel} ${TEXT_OPERATOR_LABELS[
      filter.operator
    ].toLowerCase()}${filter.value ? `: ${filter.value}` : ""}`;
  }

  if (filter.type === "number") {
    return `${columnLabel} ${filter.operator} ${filter.value}`;
  }

  return filter.operator === "between"
    ? `${columnLabel}: ${filter.value} - ${filter.secondValue}`
    : `${columnLabel} ${DATE_OPERATOR_LABELS[
        filter.operator
      ].toLowerCase()} ${filter.value}`;
}

export default function MainTable() {
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );

  const setTableContainer = useCallback(
    (node: HTMLDivElement | null) => setPortalContainer(node),
    [setPortalContainer],
  );

  const columnContext = useMemo<EmployeeColumnPresentationContext>(
    () => ({
      openColumn,
      menuPosition,
      portalContainer,
      setOpenColumn,
      setMenuPosition,
    }),
    [menuPosition, openColumn, portalContainer],
  );

  const saveCell = useCallback(
    async ({
      rowId,
      columnId,
      value,
    }: EditableDataGridCellSaveParams<TableRow>) => {
      const response = await fetch(
        `/api/table-rows/${encodeURIComponent(rowId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            [columnId]: value,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Unable to save the change.");
      }

      const payload = (await response.json()) as {
        data: TableRow;
      };

      return payload.data;
    },
    [],
  );

  const fetchData = useCallback(
    async ({
      pageIndex,
      pageSize,
      filters,
      sorting,
      signal,
    }: DataGridFetchParams): Promise<DataGridFetchResult<TableRow>> => {
      const params = new URLSearchParams({
        pageIndex: String(pageIndex),
        pageSize: String(pageSize),
        filters: JSON.stringify(filters),
        sorting: JSON.stringify(sorting),
      });
      const response = await fetch(`/api/table-rows?${params}`, { signal });

      if (!response.ok) {
        throw new Error("Unable to load rows.");
      }

      return response.json() as Promise<DataGridFetchResult<TableRow>>;
    },
    [],
  );

  const {
    recordCount,
    filters,
    applyFilter,
    clearFilters,
    isLoading,
    error,
    table,
  } = useServerDataGrid({
    columns: buildEmployeeColumns,
    columnContext,
    editorColumns: EDITOR_COLUMNS,
    getRowId: getEmployeeRowId,
    fetchData,
    saveCell,
    initialPageSize: 50,
  });

  const activeFilters = Object.entries(filters);
  const activeFilterCount = activeFilters.length;

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] space-y-3">
        <div
          ref={setTableContainer}
          className="relative overflow-visible rounded-xl border border-border bg-card shadow-xl shadow-foreground/5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Employee directory
              </h1>
              <p className="text-xs text-muted-foreground">
                Use the filter icon to narrow rows. Click a cell to edit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
                  {error}
                </div>
              )}

              <div className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                {activeFilterCount} active filter
                {activeFilterCount === 1 ? "" : "s"}
              </div>

              <button
                type="button"
                disabled={activeFilterCount === 0 || isLoading}
                onClick={clearFilters}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear filters
              </button>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2.5 sm:px-5">
              {activeFilters.map(
                ([columnId, filter]) =>
                  filter && (
                    <div
                      key={columnId}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 pl-2.5 text-xs font-medium text-primary"
                    >
                      <span>
                        {filterLabel(getColumnLabel(columnId), filter)}
                      </span>

                      <button
                        type="button"
                        onClick={() => applyFilter(columnId, null)}
                        aria-label={`Remove ${columnId} filter`}
                        className="rounded-r-md p-1.5 text-primary hover:bg-primary/15"
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
            <DataGridContainer className="border-0 bg-card">
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
