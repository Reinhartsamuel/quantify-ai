"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { conditionText, SpecSummary } from "@/components/spec-summary";
import { ErrorState } from "@/components/states";
import {
  api,
  type ConditionLike,
  type GeneratedResult,
  isApiError,
  type StrategySpecLike,
} from "@/lib/api";

type Indicator = {
  id: string;
  type: "ema" | "sma" | "rsi" | "bollinger";
  source: "open" | "high" | "low" | "close";
  period: number;
  stdDev?: number;
};

type Operand = { price?: string; indicator?: string; output?: string; constant?: number };
type Leaf = { operator: string; left: Operand; right: Operand };

const operators = [
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
  { value: "greater_than", label: "is greater than" },
  { value: "less_than", label: "is less than" },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isLeaf(condition: ConditionLike): condition is ConditionLike & Leaf {
  return typeof (condition as Leaf).operator === "string";
}

function OperandEditor({
  operand,
  onChange,
  indicators,
}: {
  operand: Operand;
  onChange: (operand: Operand) => void;
  indicators: Indicator[];
}) {
  const kind = operand.price ? "price" : operand.constant !== undefined ? "constant" : "indicator";
  return (
    <div className="operand-row">
      <select
        className="select"
        aria-label="Operand type"
        value={kind}
        onChange={(event) => {
          if (event.target.value === "price") onChange({ price: "close" });
          else if (event.target.value === "constant") onChange({ constant: 50 });
          else onChange({ indicator: indicators[0]?.id ?? "ema_fast" });
        }}
      >
        <option value="price">Price</option>
        <option value="indicator">Indicator</option>
        <option value="constant">Number</option>
      </select>
      {kind === "price" ? (
        <select
          className="select"
          aria-label="Price field"
          value={operand.price}
          onChange={(event) => onChange({ price: event.target.value })}
        >
          <option value="open">open</option>
          <option value="high">high</option>
          <option value="low">low</option>
          <option value="close">close</option>
        </select>
      ) : kind === "constant" ? (
        <input
          className="input mono"
          type="number"
          step="any"
          aria-label="Constant"
          value={operand.constant ?? 0}
          onChange={(event) => onChange({ constant: Number(event.target.value) })}
        />
      ) : (
        <select
          className="select"
          aria-label="Indicator"
          value={operand.indicator}
          onChange={(event) =>
            onChange({ indicator: event.target.value, output: operand.output ?? "value" })
          }
        >
          {indicators.map((indicator) => (
            <option key={indicator.id} value={indicator.id}>
              {indicator.id} ({indicator.type.toUpperCase()} {indicator.period})
            </option>
          ))}
        </select>
      )}
      {kind === "indicator" && operand.indicator ? (
        <select
          className="select"
          aria-label="Indicator output"
          value={operand.output ?? "value"}
          onChange={(event) => onChange({ ...operand, output: event.target.value })}
        >
          <option value="value">value</option>
          <option value="upper">upper</option>
          <option value="middle">middle</option>
          <option value="lower">lower</option>
        </select>
      ) : (
        <span className="tiny faint">operand</span>
      )}
    </div>
  );
}

function BuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const templateId = searchParams.get("template");
  const strategyIdParam = searchParams.get("strategyId");
  const fromVersionId = searchParams.get("fromVersion");

  const [strategyId, setStrategyId] = useState<string | null>(strategyIdParam);
  const [spec, setSpec] = useState<StrategySpecLike | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sourcePrompt, setSourcePrompt] = useState<string | undefined>();
  const [symbol, setSymbol] = useState<"BTC/IDR" | "ETH/IDR">("BTC/IDR");
  const [timeframe, setTimeframe] = useState<"1h" | "4h">("1h");
  const [questions, setQuestions] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<string | undefined>();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const appliedTemplate = useRef<string | null>(null);

  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates,
    staleTime: 300_000,
  });
  const fromVersion = useQuery({
    queryKey: ["version", strategyIdParam, fromVersionId],
    queryFn: () => api.getVersion(strategyIdParam as string, fromVersionId as string),
    enabled: Boolean(strategyIdParam && fromVersionId),
  });

  useEffect(() => {
    if (!fromVersion.data || spec) return;
    const version = fromVersion.data.version;
    setSpec(version.spec as StrategySpecLike);
    setStrategyId(version.strategyId);
    setSourcePrompt(version.sourcePrompt ?? undefined);
    setPrompt(version.sourcePrompt ?? "");
  }, [fromVersion.data, spec]);

  useEffect(() => {
    if (!templateId || appliedTemplate.current === templateId) return;
    const template = templates.data?.templates.find((item) => item.id === templateId);
    if (!template) return;
    appliedTemplate.current = templateId;
    setSpec(clone(template.spec));
    setSymbol(template.spec.market.symbol);
    setTimeframe(template.spec.market.timeframe);
    setSourcePrompt(template.description);
    setPrompt(template.description);
    setAssumptions([`Started from the "${template.name}" template.`]);
  }, [templateId, templates.data]);

  const generate = useMutation({
    mutationFn: () => api.generate({ prompt, symbol, timeframe }),
    onSuccess: (result: GeneratedResult) => {
      setGenerateError(null);
      setQuestions(result.questions ?? []);
      setAssumptions(result.assumptions ?? []);
      setWarnings(result.warnings ?? []);
      setExplanation(result.explanation);
      if (result.status === "ok" && result.spec) {
        setSpec(result.spec);
        setSourcePrompt(prompt);
      }
      if (result.status === "unsupported") {
        setGenerateError(
          result.explanation ?? "This request is outside the supported strategy schema.",
        );
      }
    },
    onError: (cause) => {
      setGenerateError(
        isApiError(cause) ? cause.message : "Generation failed. Try a template instead.",
      );
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!spec) throw new Error("Nothing to save.");
      let id = strategyId;
      if (!id) {
        const created = await api.createStrategy({
          name: spec.name,
          description: spec.description,
        });
        id = created.strategy.id;
        setStrategyId(id);
      }
      const saved = await api.saveVersion(id, {
        spec,
        ...(sourcePrompt ? { sourcePrompt } : {}),
      });
      return { ...saved, strategyId: id };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["strategies"] });
      router.push(`/strategies/${result.strategyId}/versions/${result.version.id}`);
    },
    onError: (cause) => setSaveError(cause),
  });

  const indicators = useMemo(() => (spec?.indicators ?? []) as unknown as Indicator[], [spec]);

  function updateSpec(updater: (draft: StrategySpecLike) => void) {
    setSpec((current) => {
      if (!current) return current;
      const draft = clone(current);
      updater(draft);
      return draft;
    });
  }

  function updateIndicator(index: number, patch: Partial<Indicator>) {
    updateSpec((draft) => {
      const current = (draft.indicators[index] as unknown as Indicator) ?? {};
      const next = { ...current, ...patch } as Indicator;
      if (patch.type) {
        next.type = patch.type;
        if (patch.type === "rsi" || patch.type === "bollinger") next.source = "close";
        if (patch.type === "bollinger" && !next.stdDev) next.stdDev = 2;
        next.period =
          patch.type === "rsi" ? 14 : patch.type === "bollinger" ? 20 : (current.period ?? 20);
      }
      draft.indicators[index] = next as unknown as Record<string, unknown> & {
        id: string;
        type: string;
      };
    });
  }

  function addIndicator() {
    updateSpec((draft) => {
      const id = `indicator_${draft.indicators.length + 1}`;
      draft.indicators.push({
        id,
        type: "ema",
        source: "close",
        period: 20,
      } as unknown as Record<string, unknown> & { id: string; type: string });
    });
  }

  function removeIndicator(index: number) {
    updateSpec((draft) => {
      draft.indicators.splice(index, 1);
    });
  }

  function setLeaf(side: "entry" | "exit", updater: (leaf: Leaf) => void) {
    updateSpec((draft) => {
      const condition = draft[side];
      if (!isLeaf(condition)) return;
      const leaf = clone(condition) as Leaf;
      updater(leaf);
      draft[side] = leaf as unknown as ConditionLike;
    });
  }

  function replaceWithLeaf(side: "entry" | "exit") {
    updateSpec((draft) => {
      draft[side] = {
        operator: "crosses_above",
        left: { price: "close" },
        right: { indicator: indicators[0]?.id ?? "ema_fast" },
      } as unknown as ConditionLike;
    });
  }

  return (
    <div className="page">
      <PageHeader
        title="Strategy builder"
        description="Describe the idea, then inspect and edit the exact rules. AI output is a proposal, never a hidden decision."
        meta={
          strategyId ? (
            <span className="badge">Editing saved strategy · new changes create a new version</span>
          ) : (
            <span className="badge">Unsaved draft</span>
          )
        }
      />

      <div className="builder">
        <div className="builder-col">
          <div className="card">
            <div className="card-head">
              <div>
                <h2 style={{ fontSize: 15 }}>1. Intent</h2>
                <p className="tiny muted">Plain language. Specific indicators help.</p>
              </div>
            </div>
            <div className="card-body stack-sm">
              <div className="field">
                <label htmlFor="prompt">Describe your strategy</label>
                <textarea
                  id="prompt"
                  className="textarea"
                  value={prompt}
                  maxLength={4000}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Buy BTC on 1h when the 20 EMA crosses above the 50 EMA, and exit when it crosses below."
                />
                <span className="field-hint">{prompt.length}/4000 characters</span>
              </div>
              <div className="inline-fields">
                <div className="field">
                  <label htmlFor="symbol">Symbol</label>
                  <select
                    id="symbol"
                    className="select"
                    value={symbol}
                    onChange={(event) => {
                      const value = event.target.value as "BTC/IDR" | "ETH/IDR";
                      setSymbol(value);
                      updateSpec((draft) => {
                        draft.market.symbol = value;
                      });
                    }}
                  >
                    <option value="BTC/IDR">BTC/IDR</option>
                    <option value="ETH/IDR">ETH/IDR</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="timeframe">Timeframe</label>
                  <select
                    id="timeframe"
                    className="select"
                    value={timeframe}
                    onChange={(event) => {
                      const value = event.target.value as "1h" | "4h";
                      setTimeframe(value);
                      updateSpec((draft) => {
                        draft.market.timeframe = value;
                      });
                    }}
                  >
                    <option value="1h">1 hour</option>
                    <option value="4h">4 hours</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => generate.mutate()}
                disabled={generate.isPending || prompt.trim().length < 8}
              >
                {generate.isPending ? (
                  <Loader2 size={15} className="spin" aria-hidden />
                ) : (
                  <Sparkles size={15} aria-hidden />
                )}
                {generate.isPending ? "Generating…" : "Generate rules"}
              </button>
              <p className="tiny faint">
                The provider may propose defaults. Defaults are listed as assumptions and require
                your confirmation before saving.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2 style={{ fontSize: 15 }}>Templates</h2>
                <p className="tiny muted">Start from a known-good rule set</p>
              </div>
            </div>
            <div className="card-body template-list">
              {(templates.data?.templates ?? []).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="template-btn"
                  onClick={() => {
                    appliedTemplate.current = template.id;
                    setSpec(clone(template.spec));
                    setSymbol(template.spec.market.symbol);
                    setTimeframe(template.spec.market.timeframe);
                    setSourcePrompt(template.description);
                    setPrompt(template.description);
                    setAssumptions([`Started from the "${template.name}" template.`]);
                    setQuestions([]);
                    setGenerateError(null);
                  }}
                >
                  <strong>{template.name}</strong>
                  <span>{template.teaches}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="builder-col">
          {questions.length > 0 ? (
            <div className="notice notice-warning" role="status">
              <strong>The AI needs a little more detail:</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {generateError ? (
            <div className="notice notice-error" role="alert">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <AlertTriangle size={15} aria-hidden style={{ marginTop: 2 }} />
                <span>{generateError}</span>
              </div>
            </div>
          ) : null}

          {!spec ? (
            <div className="card">
              <div className="empty">
                <div className="empty-icon">
                  <Sparkles size={18} aria-hidden />
                </div>
                <h3>No rules yet</h3>
                <p className="copy">
                  Generate from a description or choose a template. You will be able to edit every
                  field before saving.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2 style={{ fontSize: 15 }}>2. Rules</h2>
                    <p className="tiny muted">Editable structure, not raw JSON</p>
                  </div>
                </div>
                <div className="card-body stack">
                  <div className="field">
                    <label htmlFor="name">Strategy name</label>
                    <input
                      id="name"
                      className="input"
                      value={spec.name}
                      maxLength={120}
                      onChange={(event) =>
                        updateSpec((draft) => {
                          draft.name = event.target.value;
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="description">Description</label>
                    <input
                      id="description"
                      className="input"
                      value={spec.description}
                      maxLength={1000}
                      onChange={(event) =>
                        updateSpec((draft) => {
                          draft.description = event.target.value;
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="row-between" style={{ marginBottom: 8 }}>
                      <h3>Indicators</h3>
                      <button type="button" className="btn btn-sm" onClick={addIndicator}>
                        <Plus size={13} aria-hidden /> Add
                      </button>
                    </div>
                    <div className="stack-sm">
                      {indicators.map((indicator, index) => (
                        <div key={indicator.id} className="rule-block">
                          <div className="inline-fields">
                            <div className="field">
                              <span className="tiny muted">ID</span>
                              <input
                                className="input mono"
                                aria-label="Indicator ID"
                                value={indicator.id}
                                onChange={(event) =>
                                  updateIndicator(index, { id: event.target.value })
                                }
                              />
                            </div>
                            <div className="field">
                              <span className="tiny muted">Type</span>
                              <select
                                className="select"
                                aria-label="Indicator type"
                                value={indicator.type}
                                onChange={(event) =>
                                  updateIndicator(index, {
                                    type: event.target.value as Indicator["type"],
                                  })
                                }
                              >
                                <option value="ema">EMA</option>
                                <option value="sma">SMA</option>
                                <option value="rsi">RSI</option>
                                <option value="bollinger">Bollinger</option>
                              </select>
                            </div>
                            <div className="field">
                              <span className="tiny muted">Period</span>
                              <input
                                className="input mono"
                                type="number"
                                aria-label="Indicator period"
                                min={2}
                                max={200}
                                value={indicator.period}
                                onChange={(event) =>
                                  updateIndicator(index, { period: Number(event.target.value) })
                                }
                              />
                            </div>
                            <div className="field">
                              <span className="tiny muted">Source</span>
                              <select
                                className="select"
                                aria-label="Indicator source"
                                value={indicator.source}
                                disabled={
                                  indicator.type === "rsi" || indicator.type === "bollinger"
                                }
                                onChange={(event) =>
                                  updateIndicator(index, {
                                    source: event.target.value as Indicator["source"],
                                  })
                                }
                              >
                                <option value="open">open</option>
                                <option value="high">high</option>
                                <option value="low">low</option>
                                <option value="close">close</option>
                              </select>
                            </div>
                            {indicator.type === "bollinger" ? (
                              <div className="field">
                                <span className="tiny muted">Std dev</span>
                                <input
                                  className="input mono"
                                  type="number"
                                  aria-label="Bollinger standard deviations"
                                  min={1}
                                  max={3}
                                  step={0.1}
                                  value={indicator.stdDev ?? 2}
                                  onChange={(event) =>
                                    updateIndicator(index, { stdDev: Number(event.target.value) })
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-danger"
                              onClick={() => removeIndicator(index)}
                            >
                              <Trash2 size={13} aria-hidden /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(["entry", "exit"] as const).map((side) => {
                    const condition = spec[side];
                    return (
                      <div key={side}>
                        <h3 style={{ marginBottom: 8 }}>{side === "entry" ? "Entry" : "Exit"}</h3>
                        {isLeaf(condition) ? (
                          <div className="rule-block stack-sm">
                            <select
                              className="select"
                              aria-label={`${side} operator`}
                              value={condition.operator}
                              onChange={(event) =>
                                setLeaf(side, (leaf) => {
                                  leaf.operator = event.target.value;
                                })
                              }
                            >
                              {operators.map((operator) => (
                                <option key={operator.value} value={operator.value}>
                                  {operator.label}
                                </option>
                              ))}
                            </select>
                            <OperandEditor
                              operand={condition.left}
                              indicators={indicators}
                              onChange={(operand) =>
                                setLeaf(side, (leaf) => {
                                  leaf.left = operand;
                                })
                              }
                            />
                            <OperandEditor
                              operand={condition.right}
                              indicators={indicators}
                              onChange={(operand) =>
                                setLeaf(side, (leaf) => {
                                  leaf.right = operand;
                                })
                              }
                            />
                            <p className="tiny muted">{conditionText(condition, spec)}</p>
                          </div>
                        ) : (
                          <div className="notice notice-warning">
                            This rule uses an AND/OR composition generated from the prompt.
                            <div className="small" style={{ marginTop: 6 }}>
                              {conditionText(condition, spec)}
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ marginTop: 8 }}
                              onClick={() => replaceWithLeaf(side)}
                            >
                              Replace with a single condition
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div>
                    <h3 style={{ marginBottom: 8 }}>Risk</h3>
                    <div className="inline-fields">
                      <div className="field">
                        <span className="tiny muted">Equity per position (%)</span>
                        <input
                          className="input mono"
                          type="number"
                          aria-label="Equity per position percent"
                          min={1}
                          max={100}
                          value={spec.risk.positionSizing.value}
                          onChange={(event) =>
                            updateSpec((draft) => {
                              draft.risk.positionSizing.value = Number(event.target.value);
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <span className="tiny muted">Stop loss (%)</span>
                        <input
                          className="input mono"
                          type="number"
                          aria-label="Stop loss percent"
                          min={0.1}
                          max={50}
                          step={0.1}
                          value={spec.risk.stopLossPct ?? ""}
                          placeholder="None"
                          onChange={(event) =>
                            updateSpec((draft) => {
                              draft.risk.stopLossPct =
                                event.target.value === "" ? null : Number(event.target.value);
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <span className="tiny muted">Take profit (%)</span>
                        <input
                          className="input mono"
                          type="number"
                          aria-label="Take profit percent"
                          min={0.1}
                          max={100}
                          step={0.1}
                          value={spec.risk.takeProfitPct ?? ""}
                          placeholder="None"
                          onChange={(event) =>
                            updateSpec((draft) => {
                              draft.risk.takeProfitPct =
                                event.target.value === "" ? null : Number(event.target.value);
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <details className="card card-pad">
                <summary className="small muted" style={{ cursor: "pointer" }}>
                  Advanced JSON (read-only)
                </summary>
                <pre
                  className="mono tiny"
                  style={{ overflowX: "auto", marginTop: 12, color: "var(--muted)" }}
                >
                  {JSON.stringify(spec, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>

        <div className="builder-col">
          <div className="card">
            <div className="card-head">
              <div>
                <h2 style={{ fontSize: 15 }}>3. Review</h2>
                <p className="tiny muted">Confirm before saving a version</p>
              </div>
            </div>
            <div className="card-body stack-sm">
              {!spec ? (
                <p className="small muted">Rules will appear here after generation.</p>
              ) : (
                <>
                  <SpecSummary spec={spec} />
                  {assumptions.length > 0 ? (
                    <div>
                      <h4 className="tiny muted" style={{ marginBottom: 4 }}>
                        Assumptions to confirm
                      </h4>
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                        {assumptions.map((assumption) => (
                          <li key={assumption} className="muted">
                            {assumption}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {warnings.length > 0 ? (
                    <div className="notice notice-warning small">
                      <strong>Warnings</strong>
                      <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {explanation ? <p className="small muted">{explanation}</p> : null}
                  {saveError ? (
                    <ErrorState
                      title="Could not save"
                      message={
                        isApiError(saveError)
                          ? saveError.message
                          : "Validation failed. Check the rules."
                      }
                    />
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                  >
                    <Save size={15} aria-hidden />
                    {save.isPending ? "Saving…" : "Save version"}
                  </button>
                  <p className="tiny faint">
                    Saving creates an immutable version. You can iterate from it later without
                    changing previous results.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-body stack-sm">
              <h3 style={{ fontSize: 14 }}>Next: backtest</h3>
              <p className="small muted">
                After saving, choose a date range and run a deterministic simulation. Results show
                fees, slippage, and data limitations.
              </p>
              <Link href="/learn" className="small table-link">
                How backtesting works <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {spec ? (
        <div className="sticky-actions">
          <button
            type="button"
            className="btn"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            Regenerate
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save version"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function NewStrategyPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      }
    >
      <BuilderPage />
    </Suspense>
  );
}
