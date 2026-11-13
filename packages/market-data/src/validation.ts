import { GAP_POLICY, TIMEFRAME_MS, type Timeframe } from "@quantify/config";
import type { Candle, CandleValidation } from "./types.js";

export function validateCandles(
  candles: readonly Candle[],
  timeframe: Timeframe,
  options: { allowGaps?: boolean } = {},
): CandleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const gaps: CandleValidation["gaps"] = [];
  const duplicates: number[] = [];
  const ohlcViolations: number[] = [];
  let zeroVolumeCandles = 0;
  let maxGapCandles = 0;
  const expectedSpacing = TIMEFRAME_MS[timeframe];

  if (candles.length === 0) {
    return {
      valid: false,
      errors: ["No candles returned for the requested range."],
      warnings,
      gaps,
      maxGapCandles: 0,
      zeroVolumeCandles: 0,
      duplicates,
      ohlcViolations,
    };
  }

  const seen = new Set<number>();
  let previousTimestamp: number | null = null;
  for (const candle of candles) {
    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.volume)
    ) {
      errors.push(`Candle at ${candle.timestamp} contains a non-finite value.`);
    }
    if (candle.volume < 0) errors.push(`Candle at ${candle.timestamp} has negative volume.`);
    if (candle.volume === 0) zeroVolumeCandles += 1;
    if (
      !(
        candle.low <= candle.open &&
        candle.low <= candle.close &&
        candle.high >= candle.open &&
        candle.high >= candle.close &&
        candle.high >= candle.low
      )
    ) {
      ohlcViolations.push(candle.timestamp);
      errors.push(`Candle at ${candle.timestamp} violates OHLC relationships.`);
    }
    if (seen.has(candle.timestamp)) {
      duplicates.push(candle.timestamp);
      errors.push(`Duplicate candle timestamp ${candle.timestamp}.`);
    }
    seen.add(candle.timestamp);
    if (previousTimestamp !== null) {
      if (candle.timestamp <= previousTimestamp) {
        errors.push(`Candle timestamps are not strictly increasing at ${candle.timestamp}.`);
      } else if (candle.timestamp - previousTimestamp !== expectedSpacing) {
        const missing = Math.max(
          1,
          Math.round((candle.timestamp - previousTimestamp) / expectedSpacing) - 1,
        );
        gaps.push({ from: previousTimestamp, to: candle.timestamp, missing });
        maxGapCandles = Math.max(maxGapCandles, missing);
      }
    }
    previousTimestamp = candle.timestamp;
  }

  const expectedCandles =
    Math.round(
      ((candles.at(-1)?.timestamp ?? 0) - (candles[0]?.timestamp ?? 0)) / expectedSpacing,
    ) + 1;
  const missingTotal = gaps.reduce((sum, gap) => sum + gap.missing, 0);
  if (gaps.length > 0) {
    warnings.push(
      `${gaps.length} data gap(s) detected (${missingTotal} missing candles); gaps are never filled.`,
    );
  }
  if (zeroVolumeCandles > 0) {
    warnings.push(`${zeroVolumeCandles} candle(s) with zero volume in this range.`);
  }
  if (!options.allowGaps) {
    if (maxGapCandles > GAP_POLICY.maxGapCandles) {
      errors.push(
        `A gap of ${maxGapCandles} candles exceeds the ${GAP_POLICY.maxGapCandles}-candle limit. Choose a different range.`,
      );
    }
    if (expectedCandles > 0 && missingTotal / expectedCandles > GAP_POLICY.maxGapFraction) {
      errors.push(
        `Missing candles (${missingTotal}) exceed ${Math.round(GAP_POLICY.maxGapFraction * 100)}% of the expected range.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    gaps,
    maxGapCandles,
    zeroVolumeCandles,
    duplicates,
    ohlcViolations,
  };
}

export function trimCandles(
  candles: readonly Candle[],
  fromMs: number,
  toMs: number,
  timeframe: Timeframe,
): Candle[] {
  const spacing = TIMEFRAME_MS[timeframe];
  return candles.filter(
    (candle) => candle.timestamp >= fromMs && candle.timestamp + spacing <= toMs,
  );
}

export function sortCandles(candles: readonly Candle[]): Candle[] {
  return [...candles].sort((left, right) => left.timestamp - right.timestamp);
}
