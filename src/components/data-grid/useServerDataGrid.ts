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
  }, [fetchData, filters, pagination.pageIndex, pagination.pageSize, reportError, sorting]);

  const editableGrid = useEditableDataGrid({
    data: rows,
    setData: setRows,
    getRowId,
    editorColumns,
    onSaveCell: persistCell,
    onError: reportError,
  });

  const tableColumns = useMemo(
    () =>
      columns({
        ...columnContext,
        editableGrid,
        filters,
        applyFilter,
      }),
    [applyFilter, columnContext, columns, editableGrid, filters],
  );

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
    },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
  });

  return {
    rows,
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
  };
}
