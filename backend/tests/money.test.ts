import { Prisma } from "../generated/prisma/client.js";
import Joi from "joi";
import {
  MonetaryInputError,
  monetaryInputSchema,
  parseInrAmount,
} from "../src/utils/money.js";

describe("parseInrAmount", () => {
  test.each([
    ["0", "zero"],
    ["-1", "negative"],
    ["1.001", "more than two decimal places"],
    ["1e3", "ambiguous exponent notation"],
    ["not-a-number", "non-numeric input"],
  ])("rejects %s (%s)", (value) => {
    expect(() => parseInrAmount(value)).toThrow(MonetaryInputError);
  });

  test("preserves exact decimal and paise values", () => {
    const parsed = parseInrAmount("1250.50");

    expect(parsed.decimal.equals(new Prisma.Decimal("1250.50"))).toBe(true);
    expect(parsed.amountPaise).toBe(125050);
  });

  test("handles binary floating-point examples without arithmetic rounding", () => {
    expect(parseInrAmount(0.1).amountPaise).toBe(10);
  });

  test("rejects the imprecise large numeric example", () => {
    expect(() => parseInrAmount(90071992547409.91)).toThrow(
      MonetaryInputError,
    );
  });

  test("preserves the exact-string counterpart of the large value", () => {
    expect(parseInrAmount("90071992547409.91").amountPaise).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test("accepts the numeric ceiling and rejects the next cent", () => {
    expect(parseInrAmount(1000000000).amountPaise).toBe(100000000000);
    expect(() => parseInrAmount(1000000000.01)).toThrow(MonetaryInputError);
  });

  test("accepts the largest safe integer-paise amount", () => {
    const parsed = parseInrAmount("90071992547409.91");

    expect(parsed.amountPaise).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("rejects values above the safe integer-paise limit", () => {
    expect(() => parseInrAmount("90071992547409.92")).toThrow(
      MonetaryInputError,
    );
  });

  test("preserves exact decimal strings through the request schema", () => {
    const schema = Joi.object({ amount: monetaryInputSchema });
    const result = schema.validate({ amount: "90071992547409.91" });

    expect(result.error).toBeUndefined();
    expect(typeof result.value.amount).toBe("string");
    expect(parseInrAmount(result.value.amount).amountPaise).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  test("keeps numeric inputs on the numeric-only validation path", () => {
    const schema = Joi.object({ amount: monetaryInputSchema });

    expect(schema.validate({ amount: 1000000000 }).error).toBeUndefined();
    expect(() => parseInrAmount(1000000000.01)).toThrow(MonetaryInputError);
    expect(() => parseInrAmount("90071992547409.92")).toThrow(
      MonetaryInputError,
    );
    expect(() => parseInrAmount("not-a-number")).toThrow(MonetaryInputError);
    expect(parseInrAmount(schema.validate({ amount: 1250.5 }).value.amount).amountPaise).toBe(
      125050,
    );
  });
});
