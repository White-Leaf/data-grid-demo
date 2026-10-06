import * as React from "react";
import { useCallback, useMemo } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { DataGridColumnDef } from "../data-grid/data-grid";
import { DataGridTableDndRowHandle } from "../data-grid/data-grid-table-dnd-rows";
import { DataGridRowPinButton } from "./data-grid-row-pin-button";
import type { DataGridPinPosition } from "@/models/data-grid-row-state.model";

export interface DataGridRowOrderingOptions<TData extends object> {
  rows: TData[];
  getRowId: (row: TData) => string;
  enabled?: boolean;
  onReorder?: (
    nextRows: TData[],
    move: DataGridRowMove,
  ) => void | Promise<void>;
}

export interface DataGridRowMove {
  rowId: string;
  previousRowId: string | null;
  nextRowId: string | null;
}

export interface DataGridRowPinningOptions<TData extends object> {
  getRowId: (row: TData) => string;
  pinnedRowPositions?: ReadonlyMap<string, DataGridPinPosition>;
  onPinChange?: (
    rowId: string,
    pinPosition: DataGridPinPosition | null,
  ) => void | Promise<void>;
}

export interface DataGridRowActionConfig<TData extends object> {
  enabled?: boolean;
  orderingEnabled?: boolean;
  getRowId: (row: TData) => string;
  pinnedRowPositions?: ReadonlyMap<string, DataGridPinPosition>;
  onReorder?: (
    nextRows: TData[],
    move: DataGridRowMove,
  ) => void | Promise<void>;
  onPinChange?: (
    rowId: string,
    pinPosition: DataGridPinPosition | null,
  ) => void | Promise<void>;
}
// handle the drag and reorder
export function useDataGridRowOrdering<TData extends object>({
  rows,
  getRowId,
  enabled = true,
  onReorder,
}: DataGridRowOrderingOptions<TData>) {
  const dataIds = useMemo(  // extract the id of each row in the current order
    () => rows.map((row) => String(getRowId(row))),
    [getRowId, rows],
  );

  const handleDragEnd = useCallback( // this function is called when a row is dragged and dropped to a new position
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!enabled || !over || active.id === over.id) {
        return;
      }

      const from = dataIds.indexOf(String(active.id));
      const to = dataIds.indexOf(String(over.id));

      if (from === -1 || to === -1) {
        return;
      }

      const nextRows = arrayMove(rows, from, to);
      const movedRow = nextRows[to]; // the row that was moved to a new position
      const move: DataGridRowMove = {
        rowId: String(getRowId(movedRow)),
        previousRowId: to > 0 ? String(getRowId(nextRows[to - 1])) : null,
        nextRowId:
          to < nextRows.length - 1
            ? String(getRowId(nextRows[to + 1]))
            : null,
      };
      void onReorder?.(nextRows, move);
    },
    [dataIds, enabled, getRowId, onReorder, rows],
  );

  return {
    dataIds,
    handleDragEnd,
  };
};
// handle the pinning and unpinning of rows
export function useDataGridRowPinning<TData extends object>({
  getRowId,
  pinnedRowPositions,
  onPinChange,
}: DataGridRowPinningOptions<TData>) {
  const pinnedSet = useMemo(
    () => new Set(pinnedRowPositions?.keys() ?? []),
    [pinnedRowPositions],
  );

  const isRowPinned = useCallback( // this function checks if a row is pinned or not
    (row: TData) => pinnedSet.has(String(getRowId(row))),
    [getRowId, pinnedSet],
  );

  const setRowPinPosition = useCallback(
    (row: TData, pinPosition: DataGridPinPosition | null) => {
      const rowId = String(getRowId(row));
      onPinChange?.(rowId, pinPosition);
    },
    [getRowId, onPinChange],
  );

  return {
    pinnedSet,
    isRowPinned,
    setRowPinPosition,
  };
}
//creates the UI column containing reorder handle + pin button
export function createDataGridRowActionColumn<TData extends object>({
  getRowId,
  orderingEnabled = true,
  pinnedRowPositions,
  onPinChange,
}: DataGridRowActionConfig<TData>): DataGridColumnDef<TData> {
  return {
    id: "row-actions",
    size: 96,
    enableSorting: false,
    enableColumnFilter: false,
    enableColumnOrdering: false,
    header: "",
    cell: ({ row }) => {
      const rowId = String(getRowId(row.original));
      const pinPosition =
        pinnedRowPositions?.get(rowId) ?? (row.getIsPinned() || null);

      return React.createElement(
        "div",
        { className: "flex items-center gap-1" },
        React.createElement(DataGridTableDndRowHandle, {
          disabled: !orderingEnabled,
        }),
        React.createElement(DataGridRowPinButton, {
          pinPosition,
          onPinChange: (nextPinPosition) => onPinChange?.(rowId, nextPinPosition),
        }),
      );
    },
    meta: {
      cellClassName: "relative !p-0",
    },
  };
}
