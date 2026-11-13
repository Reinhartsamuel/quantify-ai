export type Candle = {
  venue: "indodax";
  symbol: "BTC/IDR" | "ETH/IDR";
  timeframe: "1h" | "4h";
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DataManifest = {
  provider: "indodax" | "fixture";
  endpoint: string;
  symbol: "BTC/IDR" | "ETH/IDR";
  timeframe: "1h" | "4h";
  requestedFrom: string;
  requestedTo: string;
  fetchedAt: string;
  candleCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  sha256: string;
  gaps: number;
  maxGapCandles: number;
  zeroVolumeCandles: number;
};

export type CandleValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  gaps: Array<{ from: number; to: number; missing: number }>;
  maxGapCandles: number;
  zeroVolumeCandles: number;
  duplicates: number[];
  ohlcViolations: number[];
};
