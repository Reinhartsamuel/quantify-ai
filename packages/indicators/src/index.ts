export type Series = Array<number | null>;

export function sma(values: readonly number[], period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const result: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    sum += value;
    if (index >= period) {
      sum -= values[index - period] ?? 0;
    }
    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }
  return result;
}

export function ema(values: readonly number[], period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const result: Series = new Array(values.length).fill(null);
  if (values.length < period) return result;
  let seed = 0;
  for (let index = 0; index < period; index += 1) seed += values[index] ?? 0;
  let previous = seed / period;
  result[period - 1] = previous;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    previous = value * multiplier + previous * (1 - multiplier);
    result[index] = previous;
  }
  return result;
}

export function rsi(values: readonly number[], period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const result: Series = new Array(values.length).fill(null);
  if (values.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;
  result[period] = rsiFromAverages(averageGain, averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result[index] = rsiFromAverages(averageGain, averageLoss);
  }
  return result;
}

function rsiFromAverages(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export type BollingerSeries = {
  middle: Series;
  upper: Series;
  lower: Series;
};

export function bollinger(values: readonly number[], period: number, stdDev = 2): BollingerSeries {
  const middle = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      sum += values[offset] ?? 0;
    }
    const mean = sum / period;
    let variance = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      const difference = (values[offset] ?? 0) - mean;
      variance += difference * difference;
    }
    const standardDeviation = Math.sqrt(variance / period);
    middle[index] = mean;
    upper[index] = mean + stdDev * standardDeviation;
    lower[index] = mean - stdDev * standardDeviation;
  }
  return { middle, upper, lower };
}

export function crossesAbove(
  previousLeft: number | null | undefined,
  currentLeft: number | null | undefined,
  previousRight: number | null | undefined,
  currentRight: number | null | undefined,
): boolean {
  if (
    previousLeft === null ||
    previousLeft === undefined ||
    currentLeft === null ||
    currentLeft === undefined ||
    previousRight === null ||
    previousRight === undefined ||
    currentRight === null ||
    currentRight === undefined
  ) {
    return false;
  }
  return previousLeft <= previousRight && currentLeft > currentRight;
}

export function crossesBelow(
  previousLeft: number | null | undefined,
  currentLeft: number | null | undefined,
  previousRight: number | null | undefined,
  currentRight: number | null | undefined,
): boolean {
  if (
    previousLeft === null ||
    previousLeft === undefined ||
    currentLeft === null ||
    currentLeft === undefined ||
    previousRight === null ||
    previousRight === undefined ||
    currentRight === null ||
    currentRight === undefined
  ) {
    return false;
  }
  return previousLeft >= previousRight && currentLeft < currentRight;
}
