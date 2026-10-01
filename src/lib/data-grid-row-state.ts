import { randomUUID } from "node:crypto";
import { DataGridRowStateModel } from "@/models/data-grid-row-state.model";
import { DataGridTableStateModel } from "@/models/data-grid-table-state.model";
import type { AnyBulkWriteOperation } from "mongoose"; // this type is used for bulk write operations in MongoDB
import {
  getDataGridTableAdapter,
  type DataGridTableAdapter,
} from "@/lib/data-grid-table-registry";
import type { DataGridPinPosition } from "@/models/data-grid-row-state.model";

const ORDER_GAP = 1024;
const MIN_ORDER_GAP = 0.000001;
const REBALANCE_WINDOW = 8;

export class DataGridRowStateError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function validateTableKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9-]{0,63}$/.test(value) &&
    getDataGridTableAdapter(value) !== null
  );
}

export function validateRowId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function validatePinPosition(
  value: unknown,
): value is DataGridPinPosition | null {
  return value === null || value === "top" || value === "bottom";
}

function getAdapter(tableKey: string): DataGridTableAdapter {
  const adapter = getDataGridTableAdapter(tableKey);

  if (!adapter) {
    throw new DataGridRowStateError("Unknown table key.", 404);
  }

  return adapter;
}

export async function getPinnedDataGridRows(tableKey: string) {
  const rows = await DataGridRowStateModel.find(
    { tableKey, pinPosition: { $in: ["top", "bottom"] } },
    { rowId: 1, pinPosition: 1, _id: 0 },
  )
    .sort({ rowId: 1 })
    .lean();

  return rows.map(({ rowId, pinPosition }) => ({ rowId, pinPosition }));
}

export async function persistDataGridPin(
  tableKey: string,
  rowId: string,
  pinPosition: DataGridPinPosition | null,
) {
  const adapter = getAdapter(tableKey);

  if (!(await adapter.hasRowIds([rowId]))) {
    throw new DataGridRowStateError("Table row not found.", 404);
  }

  await DataGridRowStateModel.updateOne(
    { tableKey, rowId },
    { $set: { pinPosition }, $setOnInsert: { tableKey, rowId } },
    { upsert: true, runValidators: true },
  );
}

export async function registerNewDataGridRow(tableKey: string, rowId: string) {
  const metadata = await DataGridTableStateModel.findOne({ tableKey })
    .select({ orderingInitialized: 1 })
    .lean();

  if (!metadata?.orderingInitialized) {
    return;
  }

  const lastOrderedRow = await DataGridRowStateModel.findOne({
    tableKey,
    orderRank: { $exists: true },
  })
    .sort({ orderRank: -1 })
    .select({ orderRank: 1 })
    .lean();

  await DataGridRowStateModel.updateOne(
    { tableKey, rowId },
    {
      $setOnInsert: {
        tableKey,
        rowId,
        orderRank: (lastOrderedRow?.orderRank ?? 0) + ORDER_GAP,
        pinPosition: null,
      },
    },
    { upsert: true },
  );
}

async function initializeOrderRanks( // this function initializes the order ranks for a given table key using the provided adapter
  tableKey: string,
  adapter: DataGridTableAdapter,
) {
  let metadata;

  try {
    metadata = await DataGridTableStateModel.findOneAndUpdate(
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

    metadata = await DataGridTableStateModel.findOne({ tableKey }).lean();
  }

  const repairingIncompleteRanks = Boolean(metadata?.orderingInitialized);

  if (repairingIncompleteRanks) {
    const unrankedState = await DataGridRowStateModel.exists({
      tableKey,
      orderRank: { $exists: false },
    });

    if (!unrankedState) {
      return;
    }
  }

  let nextRepairOrderRank = -ORDER_GAP;

  if (repairingIncompleteRanks) {
    const highestRank = await DataGridRowStateModel.findOne({
      tableKey,
      orderRank: { $exists: true },
    })
      .sort({ orderRank: -1 })
      .select({ orderRank: 1 })
      .lean();

    nextRepairOrderRank = highestRank?.orderRank ?? -ORDER_GAP;
  }

  await adapter.forEachRowIdBatch(500, async (rowIds, startIndex) => {
    const existing = await DataGridRowStateModel.find(
      { tableKey, rowId: { $in: rowIds } },
      { rowId: 1, orderRank: 1, _id: 0 },
    ).lean();
    const existingById = new Map(existing.map((row) => [row.rowId, row]));
    const updates: AnyBulkWriteOperation<{
      tableKey: string;
      rowId: string;
    }>[] = [];

    rowIds.forEach((rowId, index) => {
      const state = existingById.get(rowId);

      if (state?.orderRank !== undefined) {
        return;
      }

      const orderRank = repairingIncompleteRanks
        ? (nextRepairOrderRank += ORDER_GAP)
        : (startIndex + index) * ORDER_GAP;

      if (state) {
        updates.push({
          updateOne: {
            filter: { tableKey, rowId, orderRank: { $exists: false } },
            update: { $set: { orderRank } },
          },
        });
        return;
      }

      updates.push({
        updateOne: {
          filter: { tableKey, rowId },
          update: {
            $setOnInsert: { tableKey, rowId, orderRank, pinPosition: null },
          },
          upsert: true,
        },
      });
    });

    if (updates.length) {
      await DataGridRowStateModel.bulkWrite(updates);
    }
  });

  await DataGridTableStateModel.updateOne(
    { tableKey },
    { $set: { orderingInitialized: true } },
    { upsert: true },
  );
}

async function withTableOrderLock<T>(
  tableKey: string,
  work: () => Promise<T>,
) {
  const lockToken = randomUUID();

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
        upsert: true,
        setDefaultsOnInsert: true,
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

  throw new DataGridRowStateError(
    "Row ordering is busy; retry the move.",
    409,
  );
}

async function setOrderRank(tableKey: string, rowId: string, orderRank: number) {
  await DataGridRowStateModel.updateOne(
    { tableKey, rowId },
    {
      $set: { orderRank },
      $setOnInsert: { tableKey, rowId, pinPosition: null },
    },
    { upsert: true, runValidators: true },
  );
}

async function rebalanceNearPosition(
  tableKey: string,
  rowId: string,
  previousRowId: string | null,
  nextRowId: string | null,
) {
  const previous = previousRowId
    ? await DataGridRowStateModel.findOne({ tableKey, rowId: previousRowId })
        .select({ orderRank: 1 })
        .lean()
    : null;
  const next = nextRowId
    ? await DataGridRowStateModel.findOne({ tableKey, rowId: nextRowId })
        .select({ orderRank: 1 })
        .lean()
    : null;
  const anchorRank = previous?.orderRank ?? next?.orderRank;

  const left =
    anchorRank === undefined
      ? []
      : await DataGridRowStateModel.find({
          tableKey,
          rowId: { $ne: rowId },
          orderRank: previous ? { $lte: anchorRank } : { $lt: anchorRank },
        })
          .sort({ orderRank: -1 })
          .limit(REBALANCE_WINDOW)
          .select({ rowId: 1, orderRank: 1, _id: 0 })
          .lean();
  const right =
    anchorRank === undefined
      ? []
      : await DataGridRowStateModel.find({
          tableKey,
          rowId: { $ne: rowId },
          orderRank: previous ? { $gt: anchorRank } : { $gte: anchorRank },
        })
          .sort({ orderRank: 1 })
          .limit(REBALANCE_WINDOW)
          .select({ rowId: 1, orderRank: 1, _id: 0 })
          .lean();

  const leftAscending = left.reverse();
  const entries = [
    ...leftAscending.map((entry) => entry.rowId),
    rowId,
    ...right.map((entry) => entry.rowId),
  ];
  const firstRank = leftAscending[0]?.orderRank;
  const startRank =
    firstRank === undefined
      ? (right[0]?.orderRank ?? 0) - entries.length * ORDER_GAP
      : firstRank - ORDER_GAP;

  await DataGridRowStateModel.bulkWrite(
    entries.map((entryRowId, index) => ({
      updateOne: {
        filter: { tableKey, rowId: entryRowId },
        update: {
          $set: { orderRank: startRank + (index + 1) * ORDER_GAP },
          $setOnInsert: { tableKey, rowId: entryRowId, pinPosition: null },
        },
        upsert: true,
      },
    })),
  );
}

export async function persistDataGridRowMove(input: {
  tableKey: string;
  rowId: string;
  previousRowId: string | null;
  nextRowId: string | null;
}) {
  const { tableKey, rowId, previousRowId, nextRowId } = input;
  const adapter = getAdapter(tableKey);
  const ids = [rowId, previousRowId, nextRowId].filter(
    (value): value is string => value !== null,
  );

  if (new Set(ids).size !== ids.length) {
    throw new DataGridRowStateError("Reorder row IDs must be distinct.", 400);
  }

  if (!(await adapter.hasRowIds(ids))) {
    throw new DataGridRowStateError("A reorder row was not found.", 404);
  }

  await initializeOrderRanks(tableKey, adapter);

  return withTableOrderLock(tableKey, async () => {
    const moved = await DataGridRowStateModel.findOne({ tableKey, rowId })
      .select({ orderRank: 1 })
      .lean();
    let previousRank: number | undefined;
    let nextRank: number | undefined;

    if (previousRowId) {
      const previous = await DataGridRowStateModel.findOne({
        tableKey,
        rowId: previousRowId,
      })
        .select({ orderRank: 1 })
        .lean();

      if (previous?.orderRank === undefined) {
        throw new DataGridRowStateError("The reorder anchors are stale.", 409);
      }

      previousRank = previous?.orderRank;

      if (nextRowId) {
        const nextAnchor = await DataGridRowStateModel.findOne({
          tableKey,
          rowId: nextRowId,
        })
          .select({ orderRank: 1 })
          .lean();

        if (
          nextAnchor?.orderRank === undefined ||
          previousRank >= nextAnchor.orderRank
        ) {
          throw new DataGridRowStateError(
            "The reorder anchors are stale.",
            409,
          );
        }
      }

      const following = await DataGridRowStateModel.findOne({
        tableKey,
        rowId: { $ne: rowId },
        orderRank: { $gt: previousRank },
      })
        .sort({ orderRank: 1 })
        .select({ orderRank: 1 })
        .lean();

      nextRank = following?.orderRank;
    } else if (nextRowId) {
      const next = await DataGridRowStateModel.findOne({
        tableKey,
        rowId: nextRowId,
      })
        .select({ orderRank: 1 })
        .lean();

      if (next?.orderRank === undefined) {
        throw new DataGridRowStateError("The reorder anchors are stale.", 409);
      }

      nextRank = next?.orderRank;

      const preceding = await DataGridRowStateModel.findOne({
        tableKey,
        rowId: { $ne: rowId },
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
      throw new DataGridRowStateError("The reorder anchors are stale.", 409);
    }

    let orderRank: number;

    if (previousRank !== undefined && nextRank !== undefined) {
      if (nextRank - previousRank <= MIN_ORDER_GAP) {
        await rebalanceNearPosition(tableKey, rowId, previousRowId, nextRowId);
        return;
      }

      orderRank = previousRank + (nextRank - previousRank) / 2;
    } else if (previousRank !== undefined) {
      orderRank = previousRank + ORDER_GAP;
    } else if (nextRank !== undefined) {
      orderRank = nextRank - ORDER_GAP;
    } else {
      orderRank = moved?.orderRank ?? 0;
    }

    await setOrderRank(tableKey, rowId, orderRank);
  });
}
