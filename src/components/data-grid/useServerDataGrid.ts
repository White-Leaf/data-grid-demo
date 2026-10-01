"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import type { ColumnFilterState } from "@/types/filter-types";
import { useDataGridTable } from "./data-grid";
import type { DataGridColumnDef } from "./data-grid";
import {
  useEditableDataGrid,
  type EditableDataGridCellSaveParams,
  type EditableDataGridColumn,
} from "./useEditableDataGrid";
import {
  createDataGridRowActionColumn,
  useDataGridRowOrdering,
  type DataGridRowActionConfig,
} from "../row-action/useDataGridRowActions";

export interface DataGridFetchParams {
  pageIndex: number;
  pageSize: number;
  filters: Record<string, ColumnFilterState>;
  sorting: SortingState;
  signal: AbortSignal;
}

export interface DataGridFetchResult<TData> {
  data: TData[];
  total: number;
}

export type EditableDataGridController<TData extends object> = ReturnType<
  typeof useEditableDataGrid<TData>
>;

export interface ServerDataGridColumnContext<TData extends object> {
  editableGrid: EditableDataGridController<TData>;
  filters: Record<string, ColumnFilterState>;
  applyFilter: (columnId: string, filter: ColumnFilterState | null) => void;
}

export interface UseServerDataGridOptions<
  TData extends object,
  TColumnContext extends object,
> {
  columns: (
    context: ServerDataGridColumnContext<TData> & TColumnContext,
  ) => DataGridColumnDef<TData>[];
  columnContext: TColumnContext;
  editorColumns: EditableDataGridColumn<TData>[];
  getRowId: (row: TData) => string;
  rowActions?: DataGridRowActionConfig<TData>;
  fetchData: (
    params: DataGridFetchParams,
  ) => Promise<DataGridFetchResult<TData>>;
  saveCell?: (
    params: EditableDataGridCellSaveParams<TData>,
  ) => Promise<TData | void> | TData | void;
  initialPageSize?: number;
  onError?: (error: unknown) => void;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to complete the table request.";
}

export function useServerDataGrid<
  TData extends object,
  TColumnContext extends object,
>({
  columns,
  columnContext,
  editorColumns,
  getRowId,
  rowActions,
  fetchData,
  saveCell,
  initialPageSize = 50,
  onError,
}: UseServerDataGridOptions<TData, TColumnContext>) {
  const [rows, setRows] = useState<TData[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [filters, setFilters] = useState<Record<string, ColumnFilterState>>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setRefreshVersion((current) => current + 1);
  }, []);

  const configuredPinnedRowIds = rowActions?.pinnedRowIds; // extract the id of currently pinned rows

  const reportError = useCallback(
    (cause: unknown) => {
      setError(getErrorMessage(cause));
      onError?.(cause);
    },
    [onError],
  );

  const persistCell = useCallback(
    async (params: EditableDataGridCellSaveParams<TData>) => {
      const result = await saveCell?.(params);
      setError(null);
      return result;
    },
    [saveCell],
  );

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      Object.entries(filters).map(([id, value]) => ({
        id,
        value,
      })),
    [filters],
  );

  const applyFilter = useCallback(
    (columnId: string, filter: ColumnFilterState | null) => {
      setFilters((current) => {
        const next = { ...current };

        if (filter) {
          next[columnId] = filter;
        } else {
          delete next[columnId];
        }

        return next;
      });
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      setIsLoading(true);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters({});
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setIsLoading(true);
  }, []);

  const handleSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting(updater);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setIsLoading(true);
  }, []);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination((current) =>
        typeof updater === "function" ? updater(current) : updater,
      );
      setIsLoading(true);
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetchData({
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      filters,
      sorting,
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) {
          return;
        }

        setRows(result.data);
        setRecordCount(result.total);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        reportError(cause);
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchData, filters, pagination.pageIndex, pagination.pageSize, refreshVersion, reportError, sorting]);

  const editableGrid = useEditableDataGrid({
    data: rows,
    setData: setRows,
    getRowId,
    editorColumns,
    onSaveCell: persistCell,
    onError: reportError,
  });

  const rowOrdering = useDataGridRowOrdering({ // the actual row ordering logic is handled in the useDataGridRowOrdering hook
    rows,
    getRowId: rowActions?.getRowId ?? getRowId,
    enabled:
      sorting.length === 0 &&
      rowActions?.orderingEnabled !== false &&
      !isLoading,
    onReorder: (nextRows, move) => {
      const pinnedIds = new Set(   // extract the id of currently pinned rows
        Array.from(rowActions?.pinnedRowIds ?? [], String),
      );
      const getActionRowId = rowActions?.getRowId ?? getRowId;
      let reachedUnpinnedRows = false;

      for (const row of nextRows) {
        const isPinned = pinnedIds.has(String(getActionRowId(row)));

        if (isPinned && reachedUnpinnedRows) {
          return;
        }

        if (!isPinned) {  // if we reach an unpinned row, we set the flag to true
          reachedUnpinnedRows = true;
        }
      }

      setRows(nextRows);  // update the rows state with the new order
      if (!rowActions?.onReorder) {
        return;
      }

      void Promise.resolve()
        .then(() => rowActions.onReorder?.(nextRows, move))
        .then(() => setError(null))
        .catch((cause: unknown) => {
          reportError(cause);
          refresh();
        });
    },
  });

 const handleRowPinChange = useCallback(  // Connects the reusable row-action component to the supplied callback and handles loading/error/refresh
  (rowId: string, pinned: boolean) => {
    try {
      const result = rowActions?.onPinChange?.(rowId, pinned);

      if (result && typeof result.then === "function") {
        setIsLoading(true);
        void result
          .then(() => {
            setError(null);
            refresh();
          })
          .catch((cause: unknown) => {
            reportError(cause);
            refresh();
          });
      }
    } catch (cause) {
      reportError(cause);
      refresh();
    }
  },
  [refresh, reportError, rowActions],
);

  const tableColumns = useMemo(() => {
    const resolvedColumns = columns({
      ...columnContext,
      editableGrid,
      filters,
      applyFilter,
    });

    if (!rowActions?.enabled) {
      return resolvedColumns;
    }

    return [
      createDataGridRowActionColumn<TData>({
        getRowId: rowActions.getRowId ?? getRowId,
        orderingEnabled:
          sorting.length === 0 &&
          rowActions.orderingEnabled !== false &&
          !isLoading,
        pinnedRowIds: rowActions.pinnedRowIds,
        onPinChange: handleRowPinChange,
      }),
      ...resolvedColumns,
    ];
  }, [applyFilter, columnContext, columns, editableGrid, filters, getRowId, handleRowPinChange, isLoading, rowActions, sorting.length]);

  const table = useDataGridTable({
    columns: tableColumns,
    data: rows,
    getRowId,
    pageCount: Math.ceil(recordCount / pagination.pageSize),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    state: {
      columnFilters,
      sorting,
      pagination,
      rowPinning: {  //passing pinning state to tanstack table, so that it can handle pinned rows correctly
        top: Array.from(configuredPinnedRowIds ?? [], String),
        bottom: [],
      },
    },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
  });

  return {
    rows,
    setRows,
    recordCount,
    filters,
    applyFilter,
    clearFilters,
    sorting,
    pagination,
    isLoading,
    error,
    table,
    editableGrid,
    rowOrdering,
    refresh,
  };
}
