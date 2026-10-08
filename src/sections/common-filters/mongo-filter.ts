import type { ColumnFilterState } from "../../types/filter-types";

export type MongoFilterQuery = Record<string, unknown>;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createMongoFilter(filter: ColumnFilterState): unknown {
  if (filter.type === "number") {
    const value = Number(filter.value);
    if (!Number.isFinite(value)) {
      throw new Error("Numeric filter value must be a finite number.");
    }

    const operators = { "=": "$eq", ">": "$gt", "<": "$lt", ">=": "$gte", "<=": "$lte" } as const;
    return { [operators[filter.operator]]: value };
  }

  if (filter.type === "date") {
    if (filter.operator === "on") return filter.value;
    if (filter.operator === "before") return { $lt: filter.value };
    if (filter.operator === "after") return { $gt: filter.value };
    if (filter.operator === "between") {
      if (!filter.secondValue) {
        throw new Error("Date range filter requires a second date.");
      }
      return { $gte: filter.value, $lte: filter.secondValue };
    }
    throw new Error("Unsupported date filter operator.");
  }

  if (filter.operator === "blank") return { $in: ["", null] };
  if (filter.operator === "notBlank") return { $exists: true, $nin: ["", null] };

  const value = escapeRegex(filter.value.trim());
  const expressions = {
    contains: value,
    notContains: value,
    equals: `^${value}$`,
    notEquals: `^${value}$`,
    startsWith: `^${value}`,
    endsWith: `${value}$`,
  };
  const expression = expressions[filter.operator];
  if (filter.operator === "notContains" || filter.operator === "notEquals") {
    return { $not: { $regex: expression, $options: "i" } };
  }
  return { $regex: expression, $options: "i" };
}

export function createMongoFilterQuery(
  filters: Record<string, ColumnFilterState | null | undefined>,
  fields: readonly string[],
): MongoFilterQuery {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const filter = filters[field];
      return filter ? [[field, createMongoFilter(filter)]] : [];
    }),
  );
}
