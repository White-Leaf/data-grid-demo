import { Filter } from "lucide-react";
import {
  DataGridColumnHeader,
  DataGridFilterMenu,
  InlineCellEditor,
  useDataGrid,
} from "@/components/data-grid";
import type {
  DataGridColumnDef,
  ServerDataGridColumnContext,
} from "@/components/data-grid";
import { cn } from "@/lib/utils";
import type { ColumnFilterState } from "@/types/filter-types";
import type { TableRow } from "@/types/table-types";
import { TABLE_COLUMN_CONFIG } from "./table-config";
import type { TableColumnConfig } from "./table-config";

export type EmployeeColumnPresentationContext = {
  openColumn: string | null;
  menuPosition: { top: number; left: number };
  portalContainer: HTMLDivElement | null;
  setOpenColumn: (columnId: string | null) => void;
  setMenuPosition: (position: { top: number; left: number }) => void;
};

export type EmployeeColumnContext = ServerDataGridColumnContext<TableRow> &
  EmployeeColumnPresentationContext;

function EditableEmployeeCell({
  row,
  columnConfig,
  value,
  editableGrid,
}: {
  row: TableRow;
  columnConfig: TableColumnConfig;
  value: unknown;
  editableGrid: EmployeeColumnContext["editableGrid"];
}) {
  const { table } = useDataGrid<TableRow>();
  const columnId = columnConfig.id;
  const displayValue = columnConfig.displayValue
    ? columnConfig.displayValue(value)
    : String(value ?? "");
  const isEditing = editableGrid.isCellEditing(row.id, columnId);

  if (!isEditing) {
    return (
      <button
        type="button"
        className="flex h-8 min-h-8 w-full items-center px-2 text-left text-sm leading-5 outline-none focus:outline-none focus-visible:bg-transparent focus-visible:ring-0"
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          editableGrid.startCellEdit(row.id, columnId);
        }}
      >
        {displayValue}
      </button>
    );
  }

  const config = editableGrid.getEditorConfig(columnId);
  if (!config) return null;

  const orderedColumnIds = [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns(),
  ].map((column) => column.id);

  return (
    <div className="absolute inset-0 z-10 box-border flex w-full items-center overflow-visible">
      <div className="pointer-events-none absolute inset-0 z-20 border-2 border-blue-500" />
      <InlineCellEditor
        key={`${row.id}-${columnId}`}
        value={value}
        initialDraft={editableGrid.activeCell?.initialDraft}
        disabled={editableGrid.isCellPending(row.id, columnId)}
        editorType={config.editorType}
        options={config.options}
        parseValue={
          config.parseValue ? (raw) => config.parseValue?.(raw, row) : undefined
        }
        formatValue={
          config.formatValue
            ? (nextValue) =>
                config.formatValue?.(nextValue, row) ?? String(nextValue ?? "")
            : undefined
        }
        validate={
          config.validate
            ? (nextValue) => config.validate?.(nextValue, row) ?? null
            : undefined
        }
        onCommit={(nextValue) =>
          editableGrid.commitCellEdit(row, columnId, nextValue)
        }
        onCancel={() => editableGrid.cancelCellEdit(row.id, columnId)}
        onNavigate={(direction) => {
          const nextCell = editableGrid.getNextEditableCell(
            row.id,
            columnId,
            direction,
            orderedColumnIds,
          );

          if (nextCell) {
            editableGrid.startCellEdit(nextCell.rowId, nextCell.columnId);
          } else {
            editableGrid.cancelCellEdit(row.id, columnId);
          }
        }}
      />
    </div>
  );
}

export function buildEmployeeColumns({
  editableGrid,
  filters,
  applyFilter,
  openColumn,
  menuPosition,
  portalContainer,
  setOpenColumn,
  setMenuPosition,
}: EmployeeColumnContext): DataGridColumnDef<TableRow>[] {
  return TABLE_COLUMN_CONFIG.map((columnConfig) => {
    const columnId = columnConfig.id;
    const type = columnConfig.filterType;
    const displayValue = (value: unknown) =>
      columnConfig.displayValue
        ? columnConfig.displayValue(value)
        : String(value ?? "");

    return {
      id: columnId,
      accessorKey: columnId,
      size: columnConfig.size,
      enableSorting: columnConfig.sortable,
      ...(columnConfig.editable
        ? {
            meta: {
              cellEdit: {
                editable: true,
              },
              cellClassName: "relative !p-0",
            },
          }
        : {}),
      header: ({ column }) => {
        if (!columnConfig.filterable || !type) {
          return (
            <DataGridColumnHeader
              column={column}
              title={columnConfig.label}
              className="text-[11px] font-bold lowercase tracking-wide"
            />
          );
        }

        const isOpen = openColumn === columnId;

        return (
          <div className="relative -m-2 flex min-h-9 items-center justify-between gap-0.3 overflow-visible px-2 py-2">
            <DataGridColumnHeader
              column={column}
              title={columnConfig.label}
              className="text-[11px] font-bold lowercase tracking-wide"
            />
            <button
              type="button"
              aria-label={`Filter ${columnConfig.label}`}
              title={`Filter ${columnConfig.label}`}
              className={cn(
                "group inline-flex size-7 shrink-0 items-center justify-center rounded-full transition",
                isOpen
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-primary",
              )}
              onClick={(event) => {
                const buttonRect = event.currentTarget.getBoundingClientRect();
                const tableContainer = portalContainer;

                if (!tableContainer) {
                  return;
                }

                const tableRect = tableContainer.getBoundingClientRect();
                const menuWidth = 224;
                const padding = 8;
                const gap = 4;
                const rawLeft =
                  buttonRect.left - tableRect.left + tableContainer.scrollLeft;
                const top =
                  buttonRect.bottom -
                  tableRect.top +
                  tableContainer.scrollTop +
                  gap;
                const maxLeft =
                  tableContainer.clientWidth -
                  menuWidth -
                  padding +
                  tableContainer.scrollLeft;
                const left = Math.max(
                  padding + tableContainer.scrollLeft,
                  Math.min(rawLeft, maxLeft),
                );

                setMenuPosition({ top, left });
                setOpenColumn(isOpen ? null : columnId);
              }}
            >
              <Filter
                className={cn(
                  "size-3.5 transition",
                  isOpen
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-primary",
                )}
              />
            </button>

            {isOpen && (
              <DataGridFilterMenu
                type={type}
                value={filters[columnId] ?? null}
                position={menuPosition}
                portalContainer={portalContainer}
                onApply={(filter: ColumnFilterState) => {
                  applyFilter(columnId, filter);
                  setOpenColumn(null);
                }}
                onCancel={() => {
                  setOpenColumn(null);
                }}
                onClear={() => {
                  applyFilter(columnId, null);
                  setOpenColumn(null);
                }}
              />
            )}
          </div>
        );
      },
      cell: columnConfig.editable
        ? ({ row, getValue }) => (
            <EditableEmployeeCell
              row={row.original}
              columnConfig={columnConfig}
              value={getValue()}
              editableGrid={editableGrid}
            />
          )
        : ({ getValue }) => displayValue(getValue()),
    };
  });
}
