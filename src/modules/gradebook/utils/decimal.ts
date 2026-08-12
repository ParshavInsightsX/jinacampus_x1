import { Prisma, type GradebookRoundingMode } from "@prisma/client";

const roundingModes: Record<GradebookRoundingMode, Prisma.Decimal.Rounding> = {
  HALF_UP: Prisma.Decimal.ROUND_HALF_UP,
  HALF_EVEN: Prisma.Decimal.ROUND_HALF_EVEN,
  FLOOR: Prisma.Decimal.ROUND_FLOOR,
  CEILING: Prisma.Decimal.ROUND_CEIL
};

export function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function roundDecimal(
  value: Prisma.Decimal.Value,
  decimalPlaces: number,
  mode: GradebookRoundingMode = "HALF_UP"
) {
  return decimal(value).toDecimalPlaces(decimalPlaces, roundingModes[mode]);
}

export function percentage(
  numerator: Prisma.Decimal.Value,
  denominator: Prisma.Decimal.Value,
  decimalPlaces = 4,
  mode: GradebookRoundingMode = "HALF_UP"
) {
  const total = decimal(denominator);
  if (total.isZero()) return null;
  return roundDecimal(decimal(numerator).div(total).mul(100), decimalPlaces, mode);
}
