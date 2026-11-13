import { PageHeader } from "@/components/page-header";

export default function LearnPage() {
  return (
    <div className="page narrow">
      <PageHeader
        title="Learn"
        description="How the simulation works, what it cannot tell you, and a Bahasa Indonesia quick start for the workshop."
      />
      <article className="prose">
        <h2>What a backtest is</h2>
        <p>
          A backtest applies a fixed rule set to historical candles in chronological order. On each
          completed candle, the strategy is evaluated. If a signal appears, the simulated fill
          happens at the <strong>next candle open</strong>, not at the close that produced the
          signal. This avoids look-ahead bias: the strategy never sees the future.
        </p>
        <p>
          The engine is long-only spot. It holds at most one position, applies fees and slippage to
          both fills, and closes any open position at the final candle close with the reason{" "}
          <code>end_of_data</code>. Stop-loss and take-profit levels are checked against each
          candle&apos;s high and low; when both are touched in the same candle, the stop is assumed
          to execute first.
        </p>

        <h2>Reading the result</h2>
        <ul>
          <li>
            <strong>Net return</strong> is ending equity divided by initial capital, minus 1. It
            includes fees, slippage, and taxes only if you configured them.
          </li>
          <li>
            <strong>Max drawdown</strong> is the largest peak-to-trough decline in the equity curve,
            including the starting capital. A 40% drawdown means the account fell 40% from a prior
            high before recovering.
          </li>
          <li>
            <strong>Win rate</strong> is profitable closed trades divided by all closed trades. It
            says nothing about the size of wins versus losses.
          </li>
          <li>
            <strong>Profit factor</strong> is gross profit divided by absolute gross loss. It is
            empty when there are no losing trades, because the ratio is undefined.
          </li>
          <li>
            <strong>Average trade return</strong> is the mean net P&amp;L divided by entry notional
            across closed trades.
          </li>
        </ul>

        <h2>Costs and execution are assumptions</h2>
        <p>
          The workshop default is 20 bps fee per fill (0.2%, close to Indodax taker fees) and 5 bps
          slippage per fill. Real execution can be worse: liquidity, spread, latency, partial fills,
          and exchange rules all matter. A positive simulated result is not evidence of future
          profit.
        </p>

        <h2>Data limitations</h2>
        <p>
          Candles come from Indodax&apos;s public historical endpoint for BTC/IDR and ETH/IDR at 1h
          and 4h. The workshop snapshot covers 2025-01-01 through 2026-06-30 UTC. Missing candles
          are never invented: gaps are reported and large gaps stop the backtest. Zero-volume
          candles are kept and counted. A candle with no trades can make an indicator look smoother
          than the market really was.
        </p>

        <h2>Overfitting</h2>
        <p>
          If you try dozens of parameter combinations on the same range, the best one is partly
          luck. Prefer rules you can explain, keep parameter changes small, and treat a single
          in-sample result as a hypothesis. The tool does not do walk-forward or out-of-sample
          testing automatically.
        </p>

        <h2>Safety boundary</h2>
        <p>
          This product never places orders, never asks for exchange API keys, and never holds funds.
          It is an educational simulator. Nothing here is investment advice.
        </p>

        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "32px 0" }} />

        <h2>Panduan singkat Bahasa Indonesia</h2>
        <p>
          <strong>Mulai cepat:</strong> buka <em>Strategies → New strategy</em>, tulis ide dalam
          bahasa sehari-hari (contoh: &quot;Beli BTC saat EMA 20 memotong ke atas EMA 50, keluar
          saat memotong ke bawah&quot;), pilih simbol dan timeframe, lalu tekan{" "}
          <em>Generate rules</em>. Periksa asumsi, ubah aturan bila perlu, dan simpan versi. Setelah
          itu pilih rentang tanggal dan jalankan backtest.
        </p>
        <h3>Glosarium</h3>
        <ul>
          <li>
            <strong>EMA</strong> — Exponential Moving Average; rata-rata harga yang memberi bobot
            lebih besar pada data terbaru.
          </li>
          <li>
            <strong>SMA</strong> — Simple Moving Average; rata-rata harga sederhana.
          </li>
          <li>
            <strong>RSI</strong> — Relative Strength Index; osilator 0–100 untuk momentum.
          </li>
          <li>
            <strong>Bollinger Bands</strong> — pita volatilitas di sekitar rata-rata bergerak.
          </li>
          <li>
            <strong>Entry / Exit</strong> — aturan kapan membeli dan kapan menjual.
          </li>
          <li>
            <strong>Slippage</strong> — selisih harga eksekusi dari harga yang diasumsikan.
          </li>
          <li>
            <strong>Drawdown</strong> — penurunan dari puncak ekuitas sebelumnya.
          </li>
          <li>
            <strong>Backtest</strong> — simulasi aturan pada data harga historis.
          </li>
        </ul>
        <h3>Latihan workshop</h3>
        <ol>
          <li>Gunakan template EMA crossover dan simpan versi pertama.</li>
          <li>Jalankan rentang 1 tahun. Catat net return dan max drawdown.</li>
          <li>Ubah periode EMA (misalnya 10/30), simpan versi baru, dan bandingkan.</li>
          <li>Jelaskan kepada fasilitator mengapa hasil berubah dan apa risikonya.</li>
        </ol>
        <p className="small">
          Catatan: seluruh hasil adalah simulasi historis, bukan rekomendasi investasi.
        </p>
      </article>
    </div>
  );
}
