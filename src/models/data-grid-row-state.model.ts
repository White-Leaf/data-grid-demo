import mongoose, { Schema, type Model } from "mongoose";

export type DataGridPinPosition = "top" | "bottom";

export interface DataGridRowState {
  tableKey: string;
  rowId: string;
  orderRank?: number;
  pinPosition?: DataGridPinPosition | null;
  updatedAt?: Date;
}

const dataGridRowStateSchema = new Schema<DataGridRowState>(
  {
    tableKey: {
      type: String,
      required: true,
      maxlength: 64,
    },
    rowId: {
      type: String,
      required: true,
      maxlength: 128,
    },
    orderRank: {
      type: Number,
      min: -Number.MAX_VALUE,
      max: Number.MAX_VALUE,
    },
    pinPosition: {
      type: String,
      enum: ["top", "bottom", null],
      default: null,
    },
  },
  { timestamps: true },
);

dataGridRowStateSchema.index({ tableKey: 1, rowId: 1 }, { unique: true });
dataGridRowStateSchema.index({ tableKey: 1, orderRank: 1 });
dataGridRowStateSchema.index({ tableKey: 1, pinPosition: 1 });

export const DataGridRowStateModel: Model<DataGridRowState> =
  mongoose.models.DataGridRowState ||
  mongoose.model<DataGridRowState>("DataGridRowState", dataGridRowStateSchema);
