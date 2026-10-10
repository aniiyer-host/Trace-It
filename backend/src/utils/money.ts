import { Prisma } from "../../generated/prisma/client.js";
import Joi from "joi";

const MONEY_PATTERN = /^(?:0|[0-9]+)(?:\.[0-9]{1,2})?$/;
const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_NUMERIC_INR = new Prisma.Decimal("1000000000");

/** Preserve the original JSON string/number type for exact monetary parsing. */
export const monetaryInputSchema = Joi.any()
  .custom((value, helpers) => {
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }

    return helpers.error("any.invalid");
  })
  .required();

export class MonetaryInputError extends Error {
  constructor(message = "Amount must be valid to the nearest paise") {
    super(message);
    this.name = "MonetaryInputError";
  }
}

export type ParsedInrAmount = {
  decimal: Prisma.Decimal;
  amountPaise: number;
};

/** Parse an INR value without floating-point arithmetic. */
export function parseInrAmount(value: unknown): ParsedInrAmount {
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!MONEY_PATTERN.test(text)) {
    throw new MonetaryInputError();
  }

  const decimal = new Prisma.Decimal(text);
  if (typeof value === "number" && decimal.greaterThan(MAX_NUMERIC_INR)) {
    throw new MonetaryInputError();
  }
  const paiseText = decimal.times(100).toFixed(0);
  const paise = BigInt(paiseText);

  if (paise <= 0n || paise > MAX_SAFE_PAISE) {
    throw new MonetaryInputError();
  }

  return { decimal, amountPaise: Number(paise) };
}
