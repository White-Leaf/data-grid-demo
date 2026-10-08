// validation/date-validation.ts

import type { DateOperator } from "../../types/filter-types";

import {
  invalidResult,
  validResult,
  type FilterValidationResult,
} from "./validation-result";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

export function validateDateFilter(
  operator: DateOperator,
  value: string,
  secondValue?: string,
): FilterValidationResult {
  const firstDate = value.trim();
  const endDate = secondValue?.trim() ?? "";

  if (!firstDate) {
    return invalidResult("Please select a date.");
  }

  if (!isValidDate(firstDate)) {
    return invalidResult("Please select a valid date.");
  }

  if (operator !== "between") {
    return validResult();
  }

  if (!endDate) {
    return invalidResult("Please select an end date.");
  }

  if (!isValidDate(endDate)) {
    return invalidResult("Please select a valid end date.");
  }

  if (firstDate > endDate) {
    return invalidResult(
      "The start date cannot be after the end date.",
    );
  }

  return validResult();
}
