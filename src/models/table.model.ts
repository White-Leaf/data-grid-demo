import mongoose, { Schema, Model } from "mongoose";
import { STATUS_VALUES } from "@/app/main/table-config";
import type { TableRow } from "@/types/table-types";

const tableRowSchema = new Schema<TableRow>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    salary: {
      type: Number,
      required: true,
    },
    department: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      required: true,
    },
    joinDate: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const TableRowModel: Model<TableRow> =
  mongoose.models.TableRow ||
  mongoose.model<TableRow>("TableRow", tableRowSchema);
