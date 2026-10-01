import { TableRowModel } from "@/models/table.model";
import { EMPLOYEE_DIRECTORY_TABLE_KEY } from "@/lib/data-grid-constants";

export interface DataGridTableAdapter {
  forEachRowIdBatch: (  // this function iterates over the row IDs in batches
    batchSize: number,
    visit: (rowIds: string[], startIndex: number) => Promise<void>,
  ) => Promise<void>;
  hasRowIds: (rowIds: string[]) => Promise<boolean>; // this function checks if the given row IDs exist in the table
}

export { EMPLOYEE_DIRECTORY_TABLE_KEY };

export const dataGridTableRegistry: Record<string, DataGridTableAdapter> = {
  [EMPLOYEE_DIRECTORY_TABLE_KEY]: {
    forEachRowIdBatch: async (batchSize, visit) => {
      const cursor = TableRowModel.find({}, { id: 1, _id: 0 })
        .sort({ id: 1 })
        .lean()
        .cursor();
      let rowIds: string[] = [];
      let startIndex = 0;

      for await (const row of cursor) {
        rowIds.push(row.id);
        if (rowIds.length === batchSize) {
          await visit(rowIds, startIndex);
          startIndex += rowIds.length;
          rowIds = [];
        }
      }

      if (rowIds.length) {
        await visit(rowIds, startIndex);
      }
    },
    hasRowIds: async (rowIds) =>
      (await TableRowModel.countDocuments({ id: { $in: rowIds } })) ===
      new Set(rowIds).size,
  },
};

export function getDataGridTableAdapter(tableKey: string) {
  return dataGridTableRegistry[tableKey] ?? null;
}
