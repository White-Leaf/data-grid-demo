import { EMPLOYEE_DIRECTORY_TABLE_KEY } from "@/lib/data-grid-constants";

const EMPLOYEE_DIRECTORY_COLUMN_IDS = [
  "id",
  "name",
  "email",
  "age",
  "salary",
  "department",
  "city",
  "status",
  "joinDate",
] as const;

export interface DataGridColumnAdapter {
  getColumnIds: () => readonly string[];
  hasColumnId: (columnId: string) => boolean;
}

export const dataGridColumnRegistry: Record<
  string,
  DataGridColumnAdapter
> = {
  [EMPLOYEE_DIRECTORY_TABLE_KEY]: {
    getColumnIds: () => EMPLOYEE_DIRECTORY_COLUMN_IDS,

    hasColumnId: (columnId) =>
      EMPLOYEE_DIRECTORY_COLUMN_IDS.includes(
        columnId as (typeof EMPLOYEE_DIRECTORY_COLUMN_IDS)[number],
      ),
  },
};

export function getDataGridColumnAdapter(tableKey: string) {
  return dataGridColumnRegistry[tableKey] ?? null;
}
