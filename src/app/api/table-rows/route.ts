import { NextResponse } from "next/server";
import { connectDB } from "@/lib/database";
import { TableRowModel } from "@/models/table.model";
import { createMongoFilterQuery } from "@/sections/common-filters";
import type { ColumnFilterState } from "@/types/filter-types";
import { TABLE_COLUMN_CONFIG } from "@/app/main/table-config";

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

    const [rows, total] = await Promise.all([
      TableRowModel.find(query)
        .sort(Object.keys(sort).length ? sort : { id: 1 })
        .skip(pageIndex * pageSize)
        .limit(pageSize)
        .lean(),
      TableRowModel.countDocuments(query),
    ]);

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
