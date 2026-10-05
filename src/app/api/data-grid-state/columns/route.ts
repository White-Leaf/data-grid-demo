import { NextResponse } from "next/server";

import { connectDB } from "@/lib/database";

import {
  DataGridColumnStateError,
  getDataGridColumnsState,
  persistDataGridColumnMove,
  persistDataGridColumnPin,
  validateColumnId,
  validateColumnPinPosition,
} from "@/service/data-grid-column-service";

import { validateTableKey } from "@/service/data-grid-row-service";

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function errorResponse(error: unknown, message: string) {
  if (error instanceof DataGridColumnStateError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status },
    );
  }

  console.error(message, error);

  return NextResponse.json(
    { message },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const tableKey = searchParams.get("tableKey");

  if (!validateTableKey(tableKey)) {
    return NextResponse.json(
      { message: "Invalid table key." },
      { status: 400 },
    );
  }

  try {
    await connectDB();

    const data = await getDataGridColumnsState(tableKey);

    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to fetch data-grid column state.",
    );
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { message: "Forbidden request origin." },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("tableKey" in body) ||
    !("columnId" in body) ||
    !("pinPosition" in body) ||
    !validateTableKey(body.tableKey) ||
    !validateColumnId(body.columnId) ||
    !validateColumnPinPosition(body.pinPosition)
  ) {
    return NextResponse.json(
      { message: "Invalid column pin state payload." },
      { status: 400 },
    );
  }

  try {
    await connectDB();

    await persistDataGridColumnPin(
      body.tableKey,
      body.columnId,
      body.pinPosition,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to persist data-grid column pin state.",
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { message: "Forbidden request origin." },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("tableKey" in body) ||
    !("columnId" in body) ||
    !("previousColumnId" in body) ||
    !("nextColumnId" in body) ||
    !validateTableKey(body.tableKey) ||
    !validateColumnId(body.columnId) ||
    (body.previousColumnId !== null &&
      !validateColumnId(body.previousColumnId)) ||
    (body.nextColumnId !== null && !validateColumnId(body.nextColumnId))
  ) {
    return NextResponse.json(
      { message: "Invalid column reorder payload." },
      { status: 400 },
    );
  }

  try {
    await connectDB();

    await persistDataGridColumnMove({
      tableKey: body.tableKey,
      columnId: body.columnId,
      previousColumnId: body.previousColumnId,
      nextColumnId: body.nextColumnId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to persist data-grid column order.",
    );
  }
}
