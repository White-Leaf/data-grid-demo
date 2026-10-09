import { NextResponse } from "next/server";
import { connectDB } from "@/lib/database";
import { TableRowModel } from "@/models/table.model";
import { createMongoFilterQuery } from "@/sections/common-filters";
import type { ColumnFilterState } from "@/types/filter-types";
import { TABLE_COLUMN_CONFIG } from "@/app/main/table-config";
import { DataGridRowStateModel } from "@/models/data-grid-row-state.model";
import { EMPLOYEE_DIRECTORY_TABLE_KEY } from "@/registry/data-grid-table-registry";
import { registerNewDataGridRow } from "@/service/data-grid-row-service";

const filterableFields = TABLE_COLUMN_CONFIG
  .filter((column) => column.filterType)
  .map((column) => String(column.id));
const sortableFields = new Set(
  TABLE_COLUMN_CONFIG
    .filter((column) => column.sortable)
    .map((column) => String(column.id)),
);

function parseJsonParam<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const pageIndex = Math.max(Number(searchParams.get("pageIndex") ?? 0), 0);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 25), 1), 100);
    const filters = parseJsonParam<Record<string, ColumnFilterState | null>>(
      searchParams.get("filters"),
      {},
    );
    const sorting = parseJsonParam<Array<{ id: string; desc: boolean }>>(
      searchParams.get("sorting"),
      [],
    );
    const query = createMongoFilterQuery(filters, filterableFields);

    const sort: Record<string, 1 | -1> = {};
    for (const item of sorting) {
      if (sortableFields.has(item.id)) {
        sort[item.id] = item.desc ? -1 : 1;
      }
    }


    const hasExplicitSorting = Object.keys(sort).length > 0;

    const normalOrderBy: Record<string, 1 | -1> = {
      ...(hasExplicitSorting ? sort : { __gridOrderRank: 1 }),
      ...(sort.id === undefined ? { id: 1 } : {}),
    };

    // Pinned rows retain their saved order, independently of normal-row sorting.
    const pinnedOrderBy: Record<string, 1 | -1> = {
      __gridOrderRank: 1,
      id: 1,
    };

    const [result] = await TableRowModel.aggregate([
      { $match: query },
      {
        $lookup: {
          from: DataGridRowStateModel.collection.name,
          let: { rowId: "$id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$tableKey", EMPLOYEE_DIRECTORY_TABLE_KEY] },
                    { $eq: ["$rowId", "$$rowId"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, orderRank: 1, pinPosition: 1 } },
          ],
          as: "__gridState",
        },
      },
      {
        $addFields: {
          __gridOrderRank: {
            $ifNull: [
              { $arrayElemAt: ["$__gridState.orderRank", 0] },
              Number.MAX_SAFE_INTEGER,
            ],
          },
          __gridPinPriority: {
            $switch: {
              branches: [
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$__gridState.pinPosition", 0] },
                      "top",
                    ],
                  },
                  then: 0,
                },
                {
                  case: {
                    $eq: [
                      { $arrayElemAt: ["$__gridState.pinPosition", 0] },
                      "bottom",
                    ],
                  },
                  then: 2,
                },
              ],
              default: 1,
            },
          },
        },
      },
      {
        $facet: {
          topPinned: [
            { $match: { __gridPinPriority: 0 } },
            { $sort: pinnedOrderBy },
            {
              $project: {
                __gridState: 0,
                __gridOrderRank: 0,
                __gridPinPriority: 0,
              },
            },
          ],
          normal: [
            { $match: { __gridPinPriority: 1 } },
            { $sort: normalOrderBy },
            { $skip: pageIndex * pageSize },
            { $limit: pageSize },
            {
              $project: {
                __gridState: 0,
                __gridOrderRank: 0,
                __gridPinPriority: 0,
              },
            },
          ],
          bottomPinned: [
            { $match: { __gridPinPriority: 2 } },
            { $sort: pinnedOrderBy },
            {
              $project: {
                __gridState: 0,
                __gridOrderRank: 0,
                __gridPinPriority: 0,
              },
            },
          ],
          count: [
            { $match: { __gridPinPriority: 1 } },
            { $count: "total" },
          ],
        },
      },
    ]).allowDiskUse(true);

    const rows = [
      ...(result?.topPinned ?? []),
      ...(result?.normal ?? []),
      ...(result?.bottomPinned ?? []),
    ];

    const total = result?.count[0]?.total ?? 0;

    return NextResponse.json({
      data: rows,
      total,
    });
  } catch (error) {
    console.error("Failed to fetch table rows:", error);

    return NextResponse.json(
      { message: "Failed to fetch table rows" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();

    const body = await request.json();

    const row = await TableRowModel.create(body);
    await registerNewDataGridRow(EMPLOYEE_DIRECTORY_TABLE_KEY, row.id);

    return NextResponse.json(
      {
        data: row,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create table row:", error);

    return NextResponse.json(
      { message: "Failed to create table row" },
      { status: 500 }
    );
  }
}
