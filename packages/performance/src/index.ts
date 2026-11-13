export type ClosedTrade = {
  netPnl: number;
  entryNotional: number;
};

export type BacktestSummary = {
  initialCapital: number;
  endingEquity: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number | null;
  totalTrades: number;
  profitFactor: number | null;
  averageTradeReturnPct: number | null;
};

export type EquityPointLike = {
  equity: number;
};

export function maxDrawdownPct(
  equityPoints: readonly EquityPointLike[],
  initialCapital: number,
): number {
  let peak = initialCapital;
  let maximum = 0;
  for (const point of equityPoints) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) {
      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > maximum) maximum = drawdown;
    }
  }
  return maximum;
}

export function summarize(input: {
  initialCapital: number;
  endingEquity: number;
  equityPoints: readonly EquityPointLike[];
  trades: readonly ClosedTrade[];
}): BacktestSummary {
  const { initialCapital, endingEquity, equityPoints, trades } = input;
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.netPnl > 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = trades
    .filter((trade) => trade.netPnl < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.netPnl), 0);
  const averageTradeReturnPct =
    totalTrades === 0
      ? null
      : (trades.reduce(
          (sum, trade) => sum + (trade.entryNotional > 0 ? trade.netPnl / trade.entryNotional : 0),
          0,
        ) /
          totalTrades) *
        100;

  return {
    initialCapital,
    endingEquity,
    netReturnPct: initialCapital > 0 ? (endingEquity / initialCapital - 1) * 100 : 0,
    maxDrawdownPct: maxDrawdownPct(equityPoints, initialCapital),
    winRatePct: totalTrades === 0 ? null : (wins / totalTrades) * 100,
    totalTrades,
    profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
    averageTradeReturnPct,
  };
}
