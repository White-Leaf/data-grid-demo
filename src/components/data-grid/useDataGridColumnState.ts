"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DataGridTableInstance } from "@/components/data-grid/data-grid";
import type { DataGridColumnPinPosition } from "@/models/data-grid-column-state.model";

export type DataGridColumnState = {
  columnId: string;
  orderRank?: number;
  pinPosition?: DataGridColumnPinPosition | null;
};

export type DataGridColumnMove = {
  columnId: string;
  previousColumnId: string | null;
  nextColumnId: string | null;
};

type PinPosition = DataGridColumnPinPosition | null;

/** Returns the table's current column order, falling back to leaf column order. */
function getTableColumnOrder<TData extends object>(
  table: DataGridTableInstance<TData>,
): string[] {
  return table.state.columnOrder.length
    ? table.state.columnOrder
    : table.getAllLeafColumns().map((column) => column.id);
}

/** Resolves a column's pin position from a pinning state. */
function getPinPosition(
  pinning: { start: string[]; end: string[] },
  columnId: string,
): PinPosition {
  if (pinning.start.includes(columnId)) {
    return "left";
  }

  if (pinning.end.includes(columnId)) {
    return "right";
  }

  return null;
}
// Resolves the order of managed columns based on their saved state and the current table order.
function getManagedOrder(
  order: string[],
  currentOrder: string[],
  managedIds: readonly string[],
): string[] {
  const managed = new Set(managedIds);

  const orderedManaged = order.filter(
    (columnId, index) =>
      managed.has(columnId) && order.indexOf(columnId) === index,
  );

  const missing = managedIds.filter(
    (columnId) => !orderedManaged.includes(columnId),
  );

  const merged = [...orderedManaged, ...missing];

  let managedIndex = 0;

  return currentOrder.map((columnId) =>
    managed.has(columnId) ? merged[managedIndex++] : columnId,
  );
}

function makeOrderMoves(
  previousOrder: string[],
  nextOrder: string[],
): DataGridColumnMove[] {
  const workingOrder = [...previousOrder];
  const moves: DataGridColumnMove[] = [];

  for (let targetIndex = 0; targetIndex < nextOrder.length; targetIndex += 1) {
    const columnId = nextOrder[targetIndex];
    const currentIndex = workingOrder.indexOf(columnId);

    if (currentIndex === -1 || currentIndex === targetIndex) {
      continue;
    }

    workingOrder.splice(currentIndex, 1);
    workingOrder.splice(targetIndex, 0, columnId);

    moves.push({
      columnId,
      previousColumnId: workingOrder[targetIndex - 1] ?? null,
      nextColumnId: workingOrder[targetIndex + 1] ?? null,
    });
  }

  return moves;
}

export interface UseDataGridColumnStateOptions<TData extends object> {
  table: DataGridTableInstance<TData>;
  columnIds: readonly string[];
  columnState: readonly DataGridColumnState[] | null;
  enabled?: boolean;
  onReorder?: (move: DataGridColumnMove) => void | Promise<void>;
  onPinChange?: (
    columnId: string,
    pinPosition: DataGridColumnPinPosition | null,
  ) => void | Promise<void>;
}

export function useDataGridColumnState<TData extends object>({
  table,
  columnIds,
  columnState,
  enabled = true,
  onReorder,
  onPinChange,
}: UseDataGridColumnStateOptions<TData>) {
  const tableRef = useRef(table);
  const columnIdsRef = useRef(columnIds);
  const onReorderRef = useRef(onReorder);
  const onPinChangeRef = useRef(onPinChange);

  const orderRef = useRef<string[]>([]);
  const pinPositionsRef = useRef(new Map<string, PinPosition>());

  useEffect(() => {
    tableRef.current = table;
    columnIdsRef.current = columnIds;
    onReorderRef.current = onReorder;
    onPinChangeRef.current = onPinChange;
  }, [columnIds, onPinChange, onReorder, table]);

  const applyColumnState = useCallback(
    (savedState: readonly DataGridColumnState[]) => {
      const currentTable = tableRef.current;
      const ids = columnIdsRef.current;

      const savedById = new Map(
        savedState.map((column) => [column.columnId, column]),
      );

      const defaultOrder = currentTable
        .getAllLeafColumns()
        .map((column) => column.id);

      if (ids.some((columnId) => !defaultOrder.includes(columnId))) {
        throw new Error("A managed column is missing from the data grid.");
      }

      const defaultIndex = new Map(
        defaultOrder
          .filter((id) => ids.includes(id))
          .map((columnId, index) => [columnId, index]),
      );

      const persistedOrder = [...ids].sort((leftId, rightId) => {
        const leftRank = savedById.get(leftId)?.orderRank;
        const rightRank = savedById.get(rightId)?.orderRank;

        if ((leftRank === undefined) !== (rightRank === undefined)) {
          return leftRank === undefined ? 1 : -1;
        }

        return (
          (leftRank ?? 0) - (rightRank ?? 0) ||
          defaultIndex.get(leftId)! - defaultIndex.get(rightId)!
        );
      });

      const fullOrder = getManagedOrder(
        persistedOrder,
        getTableColumnOrder(currentTable),
        ids,
      );

      const managedIds = new Set(ids);
      const existingPinning = currentTable.state.columnPinning;

      const start = existingPinning.start.filter(
        (id) => !managedIds.has(id),
      );
      const end = existingPinning.end.filter((id) => !managedIds.has(id));

      const pinPositions = new Map<string, PinPosition>();

      for (const columnId of persistedOrder) {
        const pinPosition =
          savedById.get(columnId)?.pinPosition ?? null;

        pinPositions.set(columnId, pinPosition);

        if (pinPosition === "left") {
          start.push(columnId);
        } else if (pinPosition === "right") {
          end.push(columnId);
        }
      }

      orderRef.current = persistedOrder;
      pinPositionsRef.current = pinPositions;

      currentTable.setColumnOrder(fullOrder);
      currentTable.setColumnPinning({
        start,
        end,
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled || columnState === null) {
      return;
    }

    applyColumnState(columnState);
  }, [applyColumnState, columnState, enabled]);

  // Detect column order changes.
  useEffect(() => {
    if (!enabled || columnState === null) {
      return;
    }

    const ids = columnIdsRef.current;

    const currentOrder = getTableColumnOrder(tableRef.current).filter((id) =>
      ids.includes(id),
    );

    const previousOrder = orderRef.current;

    if (
      currentOrder.length === previousOrder.length &&
      currentOrder.every((id, index) => id === previousOrder[index])
    ) {
      return;
    }

    const moves = makeOrderMoves(previousOrder, currentOrder);

    orderRef.current = currentOrder;

    for (const move of moves) {
      void onReorderRef.current?.(move);
    }
  }, [columnState, enabled, table]);

  // Detect column pin changes.
  useEffect(() => {
    if (!enabled || columnState === null) {
      return;
    }

    const ids = columnIdsRef.current;
    const pinning = tableRef.current.state.columnPinning;

    const currentPinPositions = new Map<string, PinPosition>(
      ids.map((columnId) => [
        columnId,
        getPinPosition(pinning, columnId),
      ]),
    );

    const changedColumns = ids.filter(
      (columnId) =>
        currentPinPositions.get(columnId) !==
        pinPositionsRef.current.get(columnId),
    );

    if (!changedColumns.length) {
      return;
    }

    pinPositionsRef.current = currentPinPositions;

    for (const columnId of changedColumns) {
      const pinPosition =
        currentPinPositions.get(columnId) ?? null;

      void onPinChangeRef.current?.(columnId, pinPosition);
    }
  }, [columnState, enabled, table]);
}
