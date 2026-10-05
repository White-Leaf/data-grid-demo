import { randomUUID } from "node:crypto";
import type { AnyBulkWriteOperation } from "mongoose";

import { DataGridColumnStateModel } from "@/models/data-grid-column-state.model";
import { DataGridTableStateModel } from "@/models/data-grid-table-state.model";
import type {
  DataGridColumnPinPosition,
  DataGridColumnState,
} from "@/models/data-grid-column-state.model";

import { getDataGridColumnAdapter } from "@/registry/data-grid-column-registry";

const ORDER_GAP = 1024;
const MIN_ORDER_GAP = 0.000001;
const REBALANCE_WINDOW = 8;

export class DataGridColumnStateError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function validateColumnId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function validateColumnPinPosition(
  value: unknown,
): value is DataGridColumnPinPosition | null {
  return value === null || value === "left" || value === "right";
}

function getColumnAdapterOrThrow(tableKey: string) {
  const adapter = getDataGridColumnAdapter(tableKey);

  if (!adapter) {
    throw new DataGridColumnStateError(
      "Data-grid table is not registered.",
      404,
    );
  }

  return adapter;
}

function validateRegisteredColumn(
  tableKey: string,
  columnId: string,
) {
  const adapter = getColumnAdapterOrThrow(tableKey);

  if (!adapter.hasColumnId(columnId)) {
    throw new DataGridColumnStateError(
      "Column was not found.",
      404,
    );
  }

  return adapter;
}

export async function getDataGridColumnsState(tableKey: string) {
  getColumnAdapterOrThrow(tableKey);

  return DataGridColumnStateModel.find(
    { tableKey },
    {
      columnId: 1,
      orderRank: 1,
      pinPosition: 1,
      _id: 0,
    },
  )
    .sort({ orderRank: 1, columnId: 1 })
    .lean();
}

export async function persistDataGridColumnPin(
  tableKey: string,
  columnId: string,
  pinPosition: DataGridColumnPinPosition | null,
) {
  validateRegisteredColumn(tableKey, columnId);

  await DataGridColumnStateModel.updateOne(
    { tableKey, columnId },
    {
      $set: { pinPosition },
      $setOnInsert: {
        tableKey,
        columnId,
      },
    },
    {
      upsert: true,
      runValidators: true,
    },
  );
}

async function initializeColumnOrderRanks(
  tableKey: string,
  columnIds: string[],
) {
  const existing = await DataGridColumnStateModel.find(
    {
      tableKey,
      columnId: { $in: columnIds },
    },
    {
      columnId: 1,
      orderRank: 1,
      _id: 0,
    },
  ).lean();

  const existingById = new Map(
    existing.map((column) => [column.columnId, column]),
  );

  const updates = columnIds.flatMap<AnyBulkWriteOperation<DataGridColumnState>>(
    (columnId, index) => {
      const state = existingById.get(columnId);

      if (state?.orderRank !== undefined) {
        return [];
      }

      return [{
        updateOne: {
          filter: {
            tableKey,
            columnId,
            orderRank: { $exists: false },
          },
          update: {
            $set: {
              orderRank: (index + 1) * ORDER_GAP,
            },
            $setOnInsert: {
              tableKey,
              columnId,
              pinPosition: null,
            },
          },
          upsert: true,
        },
      }];
    },
  );

  if (updates.length) {
    await DataGridColumnStateModel.bulkWrite(updates);
  }
}

async function withTableOrderLock<T>(
  tableKey: string,
  work: () => Promise<T>,
) {
  const lockToken = randomUUID();

  try {
    await DataGridTableStateModel.findOneAndUpdate(
      { tableKey },
      { $setOnInsert: { tableKey, orderingInitialized: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== 11000
    ) {
      throw error;
    }
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const now = new Date();

    const lock = await DataGridTableStateModel.findOneAndUpdate(
      {
        tableKey,
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          lockToken,
          lockExpiresAt: new Date(now.getTime() + 30_000),
        },
      },
      {
        new: true,
      },
    ).lean();

    if (lock?.lockToken === lockToken) {
      try {
        return await work();
      } finally {
        await DataGridTableStateModel.updateOne(
          { tableKey, lockToken },
          {
            $unset: {
              lockToken: 1,
              lockExpiresAt: 1,
            },
          },
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new DataGridColumnStateError(
    "Column ordering is busy; retry the move.",
    409,
  );
}

async function setColumnOrderRank(
  tableKey: string,
  columnId: string,
  orderRank: number,
) {
  await DataGridColumnStateModel.updateOne(
    { tableKey, columnId },
    {
      $set: { orderRank },
      $setOnInsert: {
        tableKey,
        columnId,
        pinPosition: null,
      },
    },
    {
      upsert: true,
      runValidators: true,
    },
  );
}

async function rebalanceNearPosition(
  tableKey: string,
  columnId: string,
  previousColumnId: string | null,
  nextColumnId: string | null,
) {
  const previous = previousColumnId
    ? await DataGridColumnStateModel.findOne({
        tableKey,
        columnId: previousColumnId,
      })
        .select({ orderRank: 1 })
        .lean()
    : null;

  const next = nextColumnId
    ? await DataGridColumnStateModel.findOne({
        tableKey,
        columnId: nextColumnId,
      })
        .select({ orderRank: 1 })
        .lean()
    : null;

  const anchorRank = previous?.orderRank ?? next?.orderRank;

  const left =
    anchorRank === undefined
      ? []
      : await DataGridColumnStateModel.find({
          tableKey,
          columnId: { $ne: columnId },
          orderRank: previous ? { $lte: anchorRank } : { $lt: anchorRank },
        })
          .sort({ orderRank: -1 })
          .limit(REBALANCE_WINDOW)
          .select({ columnId: 1, orderRank: 1, _id: 0 })
          .lean();

  const right =
    anchorRank === undefined
      ? []
      : await DataGridColumnStateModel.find({
          tableKey,
          columnId: { $ne: columnId },
          orderRank: previous ? { $gt: anchorRank } : { $gte: anchorRank },
        })
          .sort({ orderRank: 1 })
          .limit(REBALANCE_WINDOW)
          .select({ columnId: 1, orderRank: 1, _id: 0 })
          .lean();

  const leftAscending = left.reverse();

  const entries = [
    ...leftAscending.map((entry) => entry.columnId),
    columnId,
    ...right.map((entry) => entry.columnId),
  ];

  const firstRank = leftAscending[0]?.orderRank;

  const startRank =
    firstRank === undefined
      ? (right[0]?.orderRank ?? 0) - entries.length * ORDER_GAP
      : firstRank - ORDER_GAP;

  await DataGridColumnStateModel.bulkWrite(
    entries.map((entryColumnId, index) => ({
      updateOne: {
        filter: {
          tableKey,
          columnId: entryColumnId,
        },
        update: {
          $set: {
            orderRank: startRank + (index + 1) * ORDER_GAP,
          },
          $setOnInsert: {
            tableKey,
            columnId: entryColumnId,
            pinPosition: null,
          },
        },
        upsert: true,
      },
    })),
  );
}

export async function persistDataGridColumnMove(input: {
  tableKey: string;
  columnId: string;
  previousColumnId: string | null;
  nextColumnId: string | null;
}) {
  const {
    tableKey,
    columnId,
    previousColumnId,
    nextColumnId,
  } = input;

  const adapter = validateRegisteredColumn(
    tableKey,
    columnId,
  );

  if (
    previousColumnId !== null &&
    !adapter.hasColumnId(previousColumnId)
  ) {
    throw new DataGridColumnStateError(
      "Previous column was not found.",
      404,
    );
  }

  if (
    nextColumnId !== null &&
    !adapter.hasColumnId(nextColumnId)
  ) {
    throw new DataGridColumnStateError(
      "Next column was not found.",
      404,
    );
  }

  const ids = [
    columnId,
    previousColumnId,
    nextColumnId,
  ].filter((value): value is string => value !== null);

  if (new Set(ids).size !== ids.length) {
    throw new DataGridColumnStateError(
      "Reorder column IDs must be distinct.",
      400,
    );
  }

  const columnIds = [...adapter.getColumnIds()];

  await initializeColumnOrderRanks(
    tableKey,
    columnIds,
  );

  return withTableOrderLock(tableKey, async () => {
    const moved = await DataGridColumnStateModel.findOne({
      tableKey,
      columnId,
    })
      .select({ orderRank: 1 })
      .lean();

    let previousRank: number | undefined;
    let nextRank: number | undefined;

    if (previousColumnId) {
      const previous = await DataGridColumnStateModel.findOne({
        tableKey,
        columnId: previousColumnId,
      })
        .select({ orderRank: 1 })
        .lean();

      if (previous?.orderRank === undefined) {
        throw new DataGridColumnStateError(
          "The reorder anchors are stale.",
          409,
        );
      }

      previousRank = previous.orderRank;

      if (nextColumnId) {
        const next = await DataGridColumnStateModel.findOne({
          tableKey,
          columnId: nextColumnId,
        })
          .select({ orderRank: 1 })
          .lean();

        if (
          next?.orderRank === undefined ||
          previousRank >= next.orderRank
        ) {
          throw new DataGridColumnStateError(
            "The reorder anchors are stale.",
            409,
          );
        }

        nextRank = next.orderRank;
      } else {
        const following = await DataGridColumnStateModel.findOne({
          tableKey,
          columnId: { $ne: columnId },
          orderRank: { $gt: previousRank },
        })
          .sort({ orderRank: 1 })
          .select({ orderRank: 1 })
          .lean();

        nextRank = following?.orderRank;
      }
    } else if (nextColumnId) {
      const next = await DataGridColumnStateModel.findOne({
        tableKey,
        columnId: nextColumnId,
      })
        .select({ orderRank: 1 })
        .lean();

      if (next?.orderRank === undefined) {
        throw new DataGridColumnStateError(
          "The reorder anchors are stale.",
          409,
        );
      }

      nextRank = next.orderRank;

      const preceding = await DataGridColumnStateModel.findOne({
        tableKey,
        columnId: { $ne: columnId },
        orderRank: { $lt: nextRank },
      })
        .sort({ orderRank: -1 })
        .select({ orderRank: 1 })
        .lean();

      previousRank = preceding?.orderRank;
    }

    if (
      previousRank !== undefined &&
      nextRank !== undefined &&
      previousRank >= nextRank
    ) {
      throw new DataGridColumnStateError(
        "The reorder anchors are stale.",
        409,
      );
    }

    let orderRank: number;

    if (previousRank !== undefined && nextRank !== undefined) {
      if (nextRank - previousRank <= MIN_ORDER_GAP) {
        await rebalanceNearPosition(
          tableKey,
          columnId,
          previousColumnId,
          nextColumnId,
        );

        return;
      }

      orderRank =
        previousRank + (nextRank - previousRank) / 2;
    } else if (previousRank !== undefined) {
      orderRank = previousRank + ORDER_GAP;
    } else if (nextRank !== undefined) {
      orderRank = nextRank - ORDER_GAP;
    } else {
      orderRank = moved?.orderRank ?? ORDER_GAP;
    }

    await setColumnOrderRank(
      tableKey,
      columnId,
      orderRank,
    );
  });
}
