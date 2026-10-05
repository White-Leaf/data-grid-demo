import mongoose, { Schema, type Model } from "mongoose";

export type DataGridColumnPinPosition = "left" | "right";

export interface DataGridColumnState {
  tableKey: string;
  columnId: string;
  orderRank?: number;
  pinPosition?: DataGridColumnPinPosition | null;
  updatedAt?: Date;
}

const dataGridColumnStateSchema = new Schema<DataGridColumnState>(
  {
    tableKey: {
      type: String,
      required: true,
      maxlength: 64,
    },
    columnId: {
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
      enum: ["left", "right", null],
      default: null,
    },
  },
  { timestamps: true },
);

dataGridColumnStateSchema.index(
  { tableKey: 1, columnId: 1 },
  { unique: true },
);

dataGridColumnStateSchema.index({ tableKey: 1, orderRank: 1 });

dataGridColumnStateSchema.index({ tableKey: 1, pinPosition: 1 });

export const DataGridColumnStateModel: Model<DataGridColumnState> =
  mongoose.models.DataGridColumnState ||
  mongoose.model<DataGridColumnState>(
    "DataGridColumnState",
    dataGridColumnStateSchema,
  );
