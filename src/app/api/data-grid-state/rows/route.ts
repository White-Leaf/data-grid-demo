import { NextResponse } from "next/server";
import { connectDB } from "@/lib/database";
import {
  DataGridRowStateError,
  getPinnedDataGridRows,
  persistDataGridPin,
  persistDataGridRowMove,
  validatePinPosition,
  validateRowId,
  validateTableKey,
} from "@/service/data-grid-row-service";

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
  if (error instanceof DataGridRowStateError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  console.error(message, error);
  return NextResponse.json({ message }, { status: 500 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tableKey = searchParams.get("tableKey");

  if (!validateTableKey(tableKey)) {
    return NextResponse.json({ message: "Invalid table key." }, { status: 400 });
  }

  try {
    await connectDB();
    const data = await getPinnedDataGridRows(tableKey);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error, "Failed to fetch data-grid state.");
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Forbidden request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("tableKey" in body) ||
    !("rowId" in body) ||
    !("pinPosition" in body) ||
    !validateTableKey(body.tableKey) ||
    !validateRowId(body.rowId) ||
    !validatePinPosition(body.pinPosition)
  ) {
    return NextResponse.json({ message: "Invalid pin state payload." }, { status: 400 });
  }

  try {
    await connectDB();
    await persistDataGridPin(body.tableKey, body.rowId, body.pinPosition);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Failed to persist data-grid pin state.");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Forbidden request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("tableKey" in body) ||
    !("rowId" in body) ||
    !("previousRowId" in body) ||
    !("nextRowId" in body) ||
    !validateTableKey(body.tableKey) ||
    !validateRowId(body.rowId) ||
    (body.previousRowId !== null && !validateRowId(body.previousRowId)) ||
    (body.nextRowId !== null && !validateRowId(body.nextRowId))
  ) {
    return NextResponse.json({ message: "Invalid reorder payload." }, { status: 400 });
  }

  try {
    await connectDB();
    await persistDataGridRowMove({
      tableKey: body.tableKey,
      rowId: body.rowId,
      previousRowId: body.previousRowId,
      nextRowId: body.nextRowId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
     console.error("Failed to persist data-grid row order:", error);
     return errorResponse(error, "Failed to persist data-grid row order.");
  }
}
