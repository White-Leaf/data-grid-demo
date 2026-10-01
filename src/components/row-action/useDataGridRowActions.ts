import * as React from "react";
import { useCallback, useMemo } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { DataGridColumnDef } from "../data-grid/data-grid";
import { DataGridTableDndRowHandle } from "../data-grid/data-grid-table-dnd-rows";
import { DataGridRowPinButton } from "./data-grid-row-pin-button";

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
  pinnedRowIds?: Iterable<string>;
  onPinChange?: (rowId: string, pinned: boolean) => void;
}

export interface DataGridRowActionConfig<TData extends object> {
  enabled?: boolean;
  orderingEnabled?: boolean;
  getRowId: (row: TData) => string;
  pinnedRowIds?: Iterable<string>;
  onReorder?: (
    nextRows: TData[],
    move: DataGridRowMove,
  ) => void | Promise<void>;
  onPinChange?: (rowId: string, pinned: boolean) => void | Promise<void>;
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
  pinnedRowIds,
  onPinChange,
}: DataGridRowPinningOptions<TData>) {
  const pinnedSet = useMemo(() => new Set(pinnedRowIds ?? []), [pinnedRowIds]); // create a set of pinned row ids for quick lookup

  const isRowPinned = useCallback( // this function checks if a row is pinned or not
    (row: TData) => pinnedSet.has(String(getRowId(row))),
    [getRowId, pinnedSet],
  );

  const togglePin = useCallback( // this function toggles the pin state of a row and calls the onPinChange callback
    (row: TData) => {
      const rowId = String(getRowId(row));
      const nextPinned = !pinnedSet.has(rowId);

      onPinChange?.(rowId, nextPinned);
    },
    [getRowId, onPinChange, pinnedSet],
  );

  return {
    pinnedSet,
    isRowPinned,
    togglePin,
  };
}
//creates the UI column containing reorder handle + pin button
export function createDataGridRowActionColumn<TData extends object>({
  getRowId,
  orderingEnabled = true,
  pinnedRowIds,
  onPinChange,
}: DataGridRowActionConfig<TData>): DataGridColumnDef<TData> {
  const pinnedSet = new Set(pinnedRowIds ?? []);

  return {
    id: "row-actions",
    size: 96,
    enableSorting: false,
    enableColumnFilter: false,
    header: "",
    cell: ({ row }) => {
      const rowId = String(getRowId(row.original));
      const isPinned = !!(row.getIsPinned() || pinnedSet.has(rowId));

      return React.createElement(
        "div",
        { className: "flex items-center gap-1" },
        React.createElement(DataGridTableDndRowHandle, {
          disabled: !orderingEnabled,
        }),
        React.createElement(DataGridRowPinButton, {
          pinned: isPinned,
          onTogglePin: () => {
            onPinChange?.(rowId, !isPinned);
          },
        }),
      );
    },
    meta: {
      cellClassName: "relative !p-0",
    },
  };
}
