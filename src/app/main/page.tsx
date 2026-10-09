"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import {
  DataGrid,
  DataGridContainer,
  DataGridPagination,
  DataGridScrollArea,
  DataGridTableDndRows,
  useDataGridColumnState,
  useServerDataGrid,
} from "@/components/data-grid";
import type {
  DataGridColumnMove,
  DataGridColumnState,
  DataGridFetchParams,
  DataGridFetchResult,
  EditableDataGridCellSaveParams,
} from "@/components/data-grid";
import type { DataGridRowMove } from "@/components/row-action/useDataGridRowActions";
import type { DataGridPinPosition } from "@/models/data-grid-row-state.model";

import { formatFilterLabel } from "@/sections/common-filters";
import type { TableRow } from "@/types/table-types";
import { EMPLOYEE_DIRECTORY_TABLE_KEY } from "@/lib/data-grid-constants";

import {
  EDITOR_COLUMNS,
  getColumnLabel,
  TABLE_COLUMN_CONFIG,
} from "@/app/main/table-config";
import {
  buildEmployeeColumns,
  type EmployeeColumnPresentationContext,
} from "@/app/main/employee-columns";

const getEmployeeRowId = (row: TableRow) => row.id;
const EMPLOYEE_COLUMN_IDS = TABLE_COLUMN_CONFIG.map(({ id }) => id);

async function ensureColumnStateResponse(
  response: Response,
  fallback: string,
) {
  if (response.ok) {
    return;
  }

  const payload: unknown = await response.json().catch(() => null);
  const message =
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
      ? payload.message
      : fallback;

  throw new Error(message);
}

export default function MainTable() {
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [portalContainer, setPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [columnState, setColumnState] =
    useState<DataGridColumnState[] | null>(null);
  const [columnStateError, setColumnStateError] = useState<string | null>(null);
  const [pinnedRows, setPinnedRows] = useState<
    Array<{ rowId: string; pinPosition: DataGridPinPosition }>
  >([]);

  const pinnedRowPositions = useMemo(
    () =>
      new Map(
        pinnedRows.map(({ rowId, pinPosition }) => [rowId, pinPosition]),
      ),
    [pinnedRows],
  );

  const [pinStateLoaded, setPinStateLoaded] = useState(false);
  const [rowStateError, setRowStateError] = useState<string | null>(null);

  const pinQueueRef = useRef<Promise<void>>(Promise.resolve());
  const reorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pinRevisionRef = useRef(0);

  const setTableContainer = useCallback(
    (node: HTMLDivElement | null) => setPortalContainer(node),
    [],
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

  const fetchColumnState = useCallback(
    async (signal: AbortSignal): Promise<DataGridColumnState[]> => {
      const response = await fetch(
        `/api/data-grid-state/columns?tableKey=${encodeURIComponent(
          EMPLOYEE_DIRECTORY_TABLE_KEY,
        )}`,
        { signal },
      );

      await ensureColumnStateResponse(
        response,
        "Unable to load saved column state.",
      );

      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("data" in payload) ||
        !Array.isArray(payload.data)
      ) {
        throw new Error("Invalid saved column state response.");
      }

      return payload.data;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    void fetchColumnState(controller.signal)
      .then((savedState) => {
        if (controller.signal.aborted) {
          return;
        }

        setColumnState(savedState);
        setColumnStateError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setColumnStateError(
            cause instanceof Error
              ? cause.message
              : "Unable to load saved column state.",
          );
        }
      });

    return () => controller.abort();
  }, [fetchColumnState]);

  const persistColumnMove = useCallback(
    async (move: DataGridColumnMove) => {
      const response = await fetch("/api/data-grid-state/columns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableKey: EMPLOYEE_DIRECTORY_TABLE_KEY,
          ...move,
        }),
      });

      await ensureColumnStateResponse(
        response,
        "Unable to save column order.",
      );
    },
    [],
  );

  const persistColumnPin = useCallback(
    async (
      columnId: string,
      pinPosition: "left" | "right" | null,
    ) => {
      const response = await fetch("/api/data-grid-state/columns", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableKey: EMPLOYEE_DIRECTORY_TABLE_KEY,
          columnId,
          pinPosition,
        }),
      });

      await ensureColumnStateResponse(
        response,
        "Unable to save column pin state.",
      );
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

  const fetchPinnedRows = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      `/api/data-grid-state/rows?tableKey=${EMPLOYEE_DIRECTORY_TABLE_KEY}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error("Unable to load saved row pin state.");
    }

    const payload = (await response.json()) as {
      data: Array<{
        rowId: string;
        pinPosition: DataGridPinPosition;
      }>;
    };

    if (!Array.isArray(payload.data)) {
      throw new Error("Invalid saved row pin response.");
    }

    return payload.data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const revision = pinRevisionRef.current;

    void fetchPinnedRows(controller.signal)
      .then((savedRows) => {
        if (
          !controller.signal.aborted &&
          revision === pinRevisionRef.current
        ) {
          setPinnedRows(savedRows);
          setPinStateLoaded(true);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setRowStateError(
            cause instanceof Error
              ? cause.message
              : "Unable to load saved row pin state.",
          );
        }
      });

    return () => controller.abort();
  }, [fetchPinnedRows]);

  // Performs and persists the actual pin/unpin operation.
  const handleRowPinChange = useCallback(
    (rowId: string, pinPosition: DataGridPinPosition | null) => {
      setPinnedRows((current) => {
        const withoutRow = current.filter((row) => row.rowId !== rowId);

        return pinPosition
          ? [...withoutRow, { rowId, pinPosition }]
          : withoutRow;
      });

      const revision = ++pinRevisionRef.current;

      const request = pinQueueRef.current.then(async () => {
        const response = await fetch("/api/data-grid-state/rows", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tableKey: EMPLOYEE_DIRECTORY_TABLE_KEY,
            rowId,
            pinPosition,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to save row pin state.");
        }
      });

      pinQueueRef.current = request.catch(() => undefined);

      return request
        .then(() => setRowStateError(null))
        .catch(async (cause: unknown) => {
          if (revision === pinRevisionRef.current) {
            try {
              setPinnedRows(await fetchPinnedRows());
            } catch {
              setRowStateError("Unable to restore saved row pin state.");
            }
          }

          throw cause;
        });
    },
    [fetchPinnedRows],
  );

  const handleRowReorder = useCallback(
    (_nextRows: TableRow[], move: DataGridRowMove) => {
      const request = reorderQueueRef.current.then(async () => {
        const response = await fetch("/api/data-grid-state/rows", {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tableKey: EMPLOYEE_DIRECTORY_TABLE_KEY,
            ...move,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to save row order.");
        }
      });

      reorderQueueRef.current = request.catch(() => undefined);

      return request;
    },
    [],
  );

  const {
    rowOrdering,
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
    rowActions: {
      enabled: true,
      orderingEnabled: pinStateLoaded,
      getRowId: getEmployeeRowId,
      pinnedRowPositions,
      onReorder: handleRowReorder,
      onPinChange: handleRowPinChange,
    },
    fetchData,
    saveCell,
    initialPageSize: 50,
  });

  useDataGridColumnState({
    table,
    columnIds: EMPLOYEE_COLUMN_IDS,
    columnState,
    onReorder: persistColumnMove,
    onPinChange: persistColumnPin,
  });

  const activeFilters = Object.entries(filters);
  const activeFilterCount = activeFilters.length;
  const tableStateError = error ?? rowStateError ?? columnStateError;

  return (
    <main className="box-border h-screen overflow-hidden bg-background p-4 sm:p-8">
      <div className="mx-auto flex h-full max-w-[full] flex-col gap-3">
        <div
          ref={setTableContainer}
          className="relative overflow-visible rounded-md border border-border  bg-card shadow-xl shadow-foreground/5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Employee table ({recordCount.toLocaleString()} rows)
              </h1>
              <p className="text-xs text-muted-foreground">
                Use the filter icon to narrow rows. Click a cell to edit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {tableStateError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
                  {tableStateError}
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
                        {formatFilterLabel(getColumnLabel(columnId), filter)}
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
              columnsPinnable: true,
              columnsMovable: true,
              columnsDraggable: true,
              headerSticky: true,
              rowsDraggable: true,
              rowsPinnable: true,
            }}
          >
            <DataGridContainer className="border-0 bg-card">
              <DataGridScrollArea
                className="
                  max-h-[calc(100vh-150px)]
                  w-full
                  overflow-hidden
                  [&>[data-slot=scroll-area-viewport]]:h-auto
                  [&>[data-slot=scroll-area-viewport]]:max-h-[calc(100vh-150px)]
                "
              >
                <DataGridTableDndRows
                  dataIds={rowOrdering.dataIds}
                  handleDragEnd={rowOrdering.handleDragEnd}
                />
              </DataGridScrollArea>
            </DataGridContainer>
            <DataGridPagination />
          </DataGrid>
        </div>
      </div>
    </main>
  );
}
