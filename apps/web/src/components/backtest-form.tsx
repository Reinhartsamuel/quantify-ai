"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, isApiError } from "@/lib/api";
import { datePreset } from "@/lib/format";

type Preset = "1M" | "3M" | "6M" | "1Y" | "2Y" | "MAX";

export function BacktestForm({
  versionId,
  symbol,
  timeframe,
}: {
  versionId: string;
  symbol: string;
  timeframe: "1h" | "4h";
}) {
  const router = useRouter();
  const availability = useQuery({
    queryKey: ["availability", symbol, timeframe],
    queryFn: () => api.availability(symbol, timeframe),
  });

  const [initialCapital, setInitialCapital] = useState(10_000_000);
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
  const [feeBps, setFeeBps] = useState(20);
  const [slippageBps, setSlippageBps] = useState(5);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!availability.data) return;
    if (availability.data.lastTimestamp) {
      const preset = datePreset("1Y", availability.data.lastTimestamp);
      setStartDate(preset.startTime.slice(0, 10));
      setEndDate(preset.endTime.slice(0, 10));
    }
  }, [availability.data]);

  const expectedCandles = useMemo(() => {
    const start = Date.parse(`${startDate}T00:00:00.000Z`);
    const end = Date.parse(`${endDate}T00:00:00.000Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.floor((end - start) / (timeframe === "1h" ? 3_600_000 : 14_400_000));
  }, [endDate, startDate, timeframe]);

  const submit = useMutation({
    mutationFn: async () => {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      if (end <= start) throw new Error("The end date must be after the start date.");
      const result = await api.submitBacktest({
        strategyVersionId: versionId,
        config: {
          initialCapital,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          feeRateBps: feeBps,
          slippageBps,
          executionTiming: "next_candle_open",
        },
      });
      return result;
    },
    onSuccess: (result) => {
      router.push(`/backtests/${result.backtestId}`);
    },
    onError: (cause) => {
      setError(
        isApiError(cause)
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Could not submit the backtest.",
      );
    },
  });

  function applyPreset(preset: Preset) {
    const range = datePreset(preset, availability.data?.lastTimestamp ?? null);
    setStartDate(range.startTime.slice(0, 10));
    setEndDate(range.endTime.slice(0, 10));
  }

  return (
    <form
      className="stack-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        submit.mutate();
      }}
    >
      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="capital">Initial capital (IDR)</label>
        <input
          id="capital"
          className="input mono"
          type="number"
          min={100_000}
          step={100_000}
          value={initialCapital}
          onChange={(event) => setInitialCapital(Number(event.target.value))}
        />
      </div>

      <div className="field">
        <span className="label">Date range</span>
        <fieldset className="pill-list" aria-label="Date presets">
          {(["1M", "3M", "6M", "1Y", "2Y", "MAX"] as Preset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="btn btn-sm"
              onClick={() => applyPreset(preset)}
            >
              {preset}
            </button>
          ))}
        </fieldset>
        <div className="inline-fields" style={{ marginTop: 6 }}>
          <div className="field">
            <label htmlFor="start" className="tiny muted">
              Start (UTC)
            </label>
            <input
              id="start"
              className="input mono"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="end" className="tiny muted">
              End (UTC, exclusive)
            </label>
            <input
              id="end"
              className="input mono"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        <span className="field-hint">
          {availability.data?.available
            ? `Data available to ${availability.data.lastIso?.slice(0, 10)} · ${availability.data.candleCount.toLocaleString()} cached candles`
            : availability.isLoading
              ? "Checking data availability…"
              : "Workshop snapshot availability could not be loaded."}
        </span>
        <span className={expectedCandles > 20_000 ? "field-error" : "field-hint"}>
          About {expectedCandles.toLocaleString()} candles. The limit is 20,000.
        </span>
      </div>

      <div className="inline-fields">
        <div className="field">
          <label htmlFor="fee">Fee (bps)</label>
          <input
            id="fee"
            className="input mono"
            type="number"
            min={0}
            max={500}
            value={feeBps}
            onChange={(event) => setFeeBps(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="slippage">Slippage (bps)</label>
          <input
            id="slippage"
            className="input mono"
            type="number"
            min={0}
            max={200}
            value={slippageBps}
            onChange={(event) => setSlippageBps(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <span className="label">Execution</span>
          <span
            className="input mono"
            style={{ display: "flex", alignItems: "center", color: "var(--muted)" }}
          >
            Next candle open (fixed)
          </span>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={submit.isPending || expectedCandles > 20_000}
      >
        <Play size={15} aria-hidden />
        {submit.isPending ? "Submitting…" : "Run backtest"}
      </button>
      <p className="tiny faint">
        Fills use the next candle open with fees and slippage. An open position is closed at the
        final candle close. Simulated results are not investment advice.
      </p>
    </form>
  );
}
