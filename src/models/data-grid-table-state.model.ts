import mongoose, { Schema, type Model } from "mongoose";

export interface DataGridTableState {
  tableKey: string;
  orderingInitialized: boolean;
  lockToken?: string;
  lockExpiresAt?: Date;
  updatedAt?: Date;
}

const dataGridTableStateSchema = new Schema<DataGridTableState>(
  {
    tableKey: {
      type: String,
      required: true,
      maxlength: 64,
      unique: true,
    },
    orderingInitialized: { // this field indicates whether the ordering of the table has been initialized or not
      type: Boolean,
      default: false,
    },
    lockToken: { // this field is used to implement a locking mechanism for the table state, to prevent concurrent modifications
      type: String,
      maxlength: 64,
    },
    lockExpiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export const DataGridTableStateModel: Model<DataGridTableState> =
  mongoose.models.DataGridTableState ||
  mongoose.model<DataGridTableState>(
    "DataGridTableState",
    dataGridTableStateSchema,
  );
