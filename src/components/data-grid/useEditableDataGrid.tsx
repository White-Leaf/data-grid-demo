"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  InlineCellEditorNavigation,
  InlineCellEditorType,
} from "./data-grid-inline-editor";

export interface EditableDataGridColumn<TData extends object> {
  id: keyof TData & string;
  editorType: InlineCellEditorType;
  options?: readonly string[];
  parseValue?: (raw: string, row: TData) => unknown;
  formatValue?: (value: unknown, row: TData) => string;
  validate?: (value: unknown, row: TData) => string | null;
}

export interface EditableDataGridCellSaveParams<TData extends object> {
  rowId: string;
  columnId: string;
  row: TData;
  previousValue: unknown;
  value: unknown;
  nextRow: TData;
}

export interface EditableDataGridErrorContext<TData extends object> {
  source: "cell";
  rowId: string;
  columnId: string;
  row: TData;
  message: string;
}

export interface UseEditableDataGridOptions<TData extends object> {
  data: TData[];
  setData: Dispatch<SetStateAction<TData[]>>;
  getRowId: (row: TData) => string;
  editorColumns: EditableDataGridColumn<TData>[];
  onSaveCell?: (
    params: EditableDataGridCellSaveParams<TData>,
  ) => Promise<TData | void> | TData | void;
  onError?: (
    error: unknown,
    context: EditableDataGridErrorContext<TData>,
  ) => void;
}

type ActiveCell = {
  rowId: string;
  columnId: string;
  initialDraft?: string;
};

function getCellKey(rowId: string, columnId: string) {
  return `${rowId}::${columnId}`;
}

function getRecordValue<TData extends object>(
  row: TData,
  columnId: keyof TData & string,
) {
  return row[columnId];
}

function setRecordValue<TData extends object>(
  row: TData,
  columnId: keyof TData & string,
  value: unknown,
): TData {
  const nextRow = { ...row };

  Object.defineProperty(nextRow, columnId, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });

  return nextRow;
}

function replaceRow<TData extends object>(
  rows: TData[],
  rowId: string,
  getRowId: (row: TData) => string,
  nextRow: TData,
) {
  return rows.map((row) => (getRowId(row) === rowId ? nextRow : row));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

export function useEditableDataGrid<TData extends object>({
  data,
  setData,
  getRowId,
  editorColumns,
  onSaveCell,
  onError,
}: UseEditableDataGridOptions<TData>) {
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);

  const [pendingCells, setPendingCells] = useState<
    Record<string, boolean>
  >({});

  const editorMap = useMemo(
    () => new Map(editorColumns.map((column) => [column.id, column])),
    [editorColumns],
  );

  const startCellEdit = useCallback(
    (rowId: string, columnId: keyof TData & string, initialDraft?: string) => {
      const row = data.find((item) => getRowId(item) === rowId);

      if (!row || !editorMap.has(columnId)) {
        return;
      }

      setActiveCell({ rowId, columnId, initialDraft });
    },
    [data, editorMap, getRowId],
  );

  const cancelCellEdit = useCallback(
    (rowId?: string, columnId?: string) => {
      const target = rowId && columnId ? { rowId, columnId } : activeCell;

      if (!target) {
        return;
      }

      setActiveCell((current) =>
        current?.rowId === target.rowId && current.columnId === target.columnId
          ? null
          : current,
      );
    },
    [activeCell],
  );

  const getEditorConfig = useCallback(
    (columnId: keyof TData & string) => {
      const column = editorMap.get(columnId);

      if (!column) {
        return undefined;
      }

      return column;
    },
    [editorMap],
  );

  const commitCellEdit = useCallback(
    async (row: TData, columnId: keyof TData & string, value: unknown) => {
      const rowId = getRowId(row);
      const cellKey = getCellKey(rowId, columnId);

      if (!editorMap.has(columnId) || pendingCells[cellKey]) {
        return false;
      }

      const currentRow = data.find((item) => getRowId(item) === rowId) ?? row;

      const previousValue = getRecordValue(currentRow, columnId);

      const nextRow = setRecordValue(currentRow, columnId, value);

      setPendingCells((pending) => ({ ...pending, [cellKey]: true }));

      // Optimistic update.
      setData((rows) => replaceRow(rows, rowId, getRowId, nextRow));

      try {
        const savedRow =
          (await onSaveCell?.({
            rowId,
            columnId,
            row: currentRow,
            previousValue,
            value,
            nextRow,
          })) ?? nextRow;

        setData((rows) => replaceRow(rows, rowId, getRowId, savedRow));

        setActiveCell((current) =>
          current?.rowId === rowId && current.columnId === columnId
            ? null
            : current,
        );

        return true;
      } catch (error) {
        const message = getErrorMessage(error, "Unable to save the change.");

        // Roll back the optimistic update.
        setData((rows) =>
          rows.map((item) =>
            getRowId(item) === rowId
              ? setRecordValue(item, columnId, previousValue)
              : item,
          ),
        );

        onError?.(error, {
          source: "cell",
          rowId,
          columnId,
          row: currentRow,
          message,
        });

        throw error;
      } finally {
        setPendingCells((pending) => ({ ...pending, [cellKey]: false }));
      }
    },
    [
      data,
      editorMap,
      getRowId,
      onError,
      onSaveCell,
      pendingCells,
      setData,
    ],
  );

  const getNextEditableCell = useCallback(
    (
      rowId: string,
      columnId: string,
      direction: InlineCellEditorNavigation,
    ) => {
      const columnIndex = editorColumns.findIndex(
        (column) => column.id === columnId,
      );

      const rowIndex = data.findIndex((row) => getRowId(row) === rowId);

      if (columnIndex < 0 || rowIndex < 0) {
        return null;
      }

      const nextColumnIndex =
        direction === "next" ? columnIndex + 1 : columnIndex - 1;

      if (nextColumnIndex >= 0 && nextColumnIndex < editorColumns.length) {
        return { rowId, columnId: editorColumns[nextColumnIndex].id };
      }

      const nextRowIndex = direction === "next" ? rowIndex + 1 : rowIndex - 1;

      const nextRow = data[nextRowIndex];

      if (!nextRow) {
        return null;
      }

      return {
        rowId: getRowId(nextRow),
        columnId:
          direction === "next"
            ? editorColumns[0].id
            : editorColumns[editorColumns.length - 1].id,
      };
    },
    [data, editorColumns, getRowId],
  );

  const isCellEditing = useCallback(
    (rowId: string, columnId: string) =>
      activeCell?.rowId === rowId && activeCell.columnId === columnId,
    [activeCell],
  );

  const isCellPending = useCallback(
    (rowId: string, columnId: string) =>
      Boolean(pendingCells[getCellKey(rowId, columnId)]),
    [pendingCells],
  );

  const isRowPending = useCallback(
    (rowId: string) =>
      Object.entries(pendingCells).some(
        ([cellKey, pending]) => pending && cellKey.startsWith(`${rowId}::`),
      ),
    [pendingCells],
  );

  return useMemo(
    () => ({
      activeCell,
      startCellEdit,
      cancelCellEdit,
      getEditorConfig,
      commitCellEdit,
      getNextEditableCell,
      isCellEditing,
      isCellPending,
      isRowPending,
    }),
    [
      activeCell,
      cancelCellEdit,
      commitCellEdit,
      getEditorConfig,
      getNextEditableCell,
      isCellEditing,
      isCellPending,
      isRowPending,
      startCellEdit,
    ],
  );
}
