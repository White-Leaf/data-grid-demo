
import type { TextOperator } from "../../types/filter-types";

import {
  invalidResult,
  validResult,
  type FilterValidationResult,
} from "./validation-result";

export function validateTextFilter(
  operator: TextOperator,
  value: string,
): FilterValidationResult {
  const trimmedValue = value.trim();

  if (operator === "blank" || operator === "notBlank") {
    if (trimmedValue !== "") {
      return invalidResult(
        "This operator does not require a value.",
      );
    }

    return validResult();
  }

  if (trimmedValue === "") {
    return invalidResult("Please enter a text value.");
  }


  return validResult();
}
