import { NextResponse } from "next/server";
import { connectDB } from "@/lib/database";
import { TableRowModel } from "@/models/table.model";
import { TABLE_COLUMN_CONFIG } from "@/app/main/table-config";

const writableFields = TABLE_COLUMN_CONFIG
	.filter((column) => column.editable)
	.map((column) => String(column.id));

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ rowId: string }> },
) {
	try {
		await connectDB();
		const { rowId } = await params;
		const body = (await request.json()) as Record<string, unknown>;
		const updates = Object.fromEntries(
			Object.entries(body).filter(([key]) => writableFields.includes(key)),
		);

		if (!Object.keys(updates).length) {
			return NextResponse.json({ message: "No editable fields supplied" }, { status: 400 });
		}

		const row = await TableRowModel.findOneAndUpdate(
			{ id: rowId },
			{ $set: updates },
			{ new: true, runValidators: true },
		).lean();

		if (!row) return NextResponse.json({ message: "Table row not found" }, { status: 404 });
		return NextResponse.json({ data: row });
	} catch (error) {
		console.error("Failed to update table row:", error);
		return NextResponse.json({ message: "Failed to update table row" }, { status: 400 });
	}
}
