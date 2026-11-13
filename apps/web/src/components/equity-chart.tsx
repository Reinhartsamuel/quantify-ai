"use client";

import { useEffect, useMemo, useRef } from "react";
import type { EquityPointDto } from "@/lib/api";
import { formatIdr, formatNumber } from "@/lib/format";

export function EquityChart({
  points,
  mode = "equity",
  label,
}: {
  points: EquityPointDto[];
  mode?: "equity" | "drawdown";
  label?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);

  const series = useMemo(
    () =>
      points.map((point) => ({
        time: Math.floor(point.timestamp / 1000),
        value: mode === "equity" ? point.equity : point.drawdownPct,
      })),
    [mode, points],
  );

  useEffect(() => {
    const element = container.current;
    if (!element || series.length === 0) return;
    let disposed = false;
    let chart: import("lightweight-charts").IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("lightweight-charts").then(({ createChart, LineStyle, ColorType }) => {
      if (disposed) return;
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue("--accent").trim();
      const negative = styles.getPropertyValue("--negative").trim();
      const muted = styles.getPropertyValue("--muted").trim();
      const line = styles.getPropertyValue("--line").trim();
      const grid = styles.getPropertyValue("--chart-grid").trim();
      chart = createChart(element, {
        width: element.clientWidth,
        height: element.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: muted,
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: grid, style: LineStyle.Dotted },
          horzLines: { color: grid, style: LineStyle.Dotted },
        },
        rightPriceScale: { borderColor: line },
        timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
        localization: {
          priceFormatter:
            mode === "equity"
              ? (value: number) => formatIdr(value, true)
              : (value: number) => `${formatNumber(value, 1)}%`,
        },
      });
      const lineSeries = chart.addLineSeries({
        color: mode === "equity" ? accent : negative,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      lineSeries.setData(
        series.map((point) => ({
          time: point.time as import("lightweight-charts").UTCTimestamp,
          value: point.value,
        })),
      );
      chart.timeScale().fitContent();
      resizeObserver = new ResizeObserver(() => {
        if (chart) chart.applyOptions({ width: element.clientWidth, height: element.clientHeight });
      });
      resizeObserver.observe(element);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chart?.remove();
    };
  }, [mode, series]);

  const sampled = useMemo(() => {
    if (points.length <= 40) return points;
    const step = Math.ceil(points.length / 40);
    const result = points.filter((_, index) => index % step === 0);
    const last = points.at(-1);
    if (last && result.at(-1) !== last) result.push(last);
    return result;
  }, [points]);

  if (points.length === 0) {
    return <div className="empty small">No curve points are available.</div>;
  }

  return (
    <div>
      <div
        ref={container}
        className="chart-frame"
        role="img"
        aria-label={label ?? (mode === "equity" ? "Equity curve" : "Drawdown curve")}
      />
      <details className="chart-table">
        <summary>View as table</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th style={{ textAlign: "right" }}>{mode === "equity" ? "Equity" : "Drawdown"}</th>
              </tr>
            </thead>
            <tbody>
              {sampled.map((point) => (
                <tr key={point.timestamp}>
                  <td className="mono tiny">{new Date(point.timestamp).toISOString()}</td>
                  <td className="num">
                    {mode === "equity"
                      ? formatIdr(point.equity)
                      : `${formatNumber(point.drawdownPct, 2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
