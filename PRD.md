# Product Requirements Document (PRD)

## AI Trading Strategy Lab

-   **Document status:** Draft v0.1
-   **Prepared:** 12 November 2026
-   **Product type:** AI-assisted crypto strategy creation and
    historical backtesting platform
-   **Initial launch context:** BlockDev.id educational workshop
-   **Primary release:** Workshop MVP
-   **Owner:** Product founder / engineering lead
-   **Working product name:** AI Trading Strategy Lab (name is
    provisional)

---

## 1. Executive Summary

AI Trading Strategy Lab helps people turn crypto trading ideas expressed
in natural language into structured, understandable, and testable
trading strategies. Users can review and edit the generated rules, run
historical backtests, and inspect performance and trade-level results
without writing code or connecting exchange accounts.

The first release is a web platform used as both:

1.  The hands-on environment for a BlockDev.id workshop.
2.  The foundation of a standalone product that can be validated with
    early users after the workshop.

The MVP deliberately stops at historical simulation. It does **not**
place live orders, custody funds, connect exchange accounts, provide
investment advice, or promise profitable strategies.

### Product promise

> Describe your strategy. Let AI structure it. Backtest it. Understand
> its performance.

### Core product loop

**Describe → Generate → Review → Validate → Backtest → Analyze →
Iterate**

---

## 2. Problem Statement

People may have trading ideas but lack the technical ability to
translate them into executable rules and evaluate them systematically.

Common barriers include:

-   Translating a verbal idea into precise entry and exit conditions.
-   Understanding how indicators and parameters interact.
-   Writing code to implement a strategy.
-   Obtaining and preparing historical market data.
-   Running a backtest and interpreting its output.
-   Distinguishing plausible results from misleading results caused by
    fees, slippage, bad data, or overfitting.

Existing technical workflows often require users to understand
programming, APIs, data formats, and deployment. This product aims to
hide that infrastructure while keeping strategy rules and simulation
assumptions transparent.

---

## 3. Product Vision and Positioning

### Vision

Make systematic crypto strategy experimentation accessible to people who
can describe a trading idea but cannot code it.

### Positioning

An AI-assisted environment to create, validate, and experiment with
crypto trading strategies.

### What the product is

-   A natural-language strategy builder.
-   A structured strategy editor.
-   A historical backtesting environment.
-   An educational tool for understanding systematic trading.
-   A foundation that may later support paper trading and live
    execution.

### What the product is not

-   A signal-selling service.
-   An AI market predictor.
-   A guaranteed-profit product.
-   A copy-trading platform.
-   A broker, exchange, custodian, or wallet.
-   An autonomous agent that can freely execute arbitrary code or
    trades.

---

## 4. Target Users

The product supports two initial audience profiles. They should have
different onboarding and workshop teaching paths, even if they use the
same platform.

### Segment A --- Non-technical crypto traders (primary initial target)

**Profile** - Has traded crypto before. - Understands basic market
concepts and may know indicators such as RSI or EMA. - Cannot or does
not want to program. - Has trading ideas but cannot implement or test
them independently.

**Jobs to be done** - Express a trading idea in plain language. -
Convert it into explicit, reviewable rules. - Test it against historical
data. - Understand its strengths, weaknesses, and risk
characteristics. - Iterate on parameters without writing code.

**Main pain** "I know what I want my strategy to do, but I cannot turn
it into a bot or test it properly."

### Segment B --- Complete beginners (secondary initial target)

**Profile** - May not have traded crypto before. - Has little or no
familiarity with technical indicators. - Is interested in AI, crypto,
and how trading bots work. - Needs concepts explained before building a
strategy.

**Jobs to be done** - Understand the difference between discretionary
and systematic trading. - Learn basic strategy concepts: entry, exit,
position sizing, and risk. - Create a simple rules-based strategy with
guided assistance. - See how historical simulation works and what its
limitations are.

**Main pain** "I hear about AI trading bots, but I do not understand how
they are made or evaluated."

### Audience decision

BlockDev.id must confirm: - Expected attendee count. - Whether attendees
are existing traders or complete beginners. - Workshop duration. -
Whether attendees bring laptops and have reliable internet. - Expected
balance of presentation versus hands-on activity. - Whether participants
can retain access to the platform after the workshop.

If the audience is mixed, use a common introductory section and provide
separate guided exercises/templates for the two segments.

---

## 5. Goals and Success Metrics

### Product goals for the workshop MVP

1.  A participant can create a strategy without writing code.
2.  AI output is structured, reviewable, and editable.
3.  A valid strategy can be backtested against supported historical
    data.
4.  The user can understand the main backtest metrics and inspect
    simulated trades.
5.  The platform can be used reliably by a workshop cohort.
6.  Users can return after the event and continue experimenting.

### Initial success metrics

---

Metric Definition Initial target

---

Registration-to-activation Registered users who Establish baseline
create a strategy

Strategy generation success Generation requests ≥ 90% in tested prompts
resulting in valid  
specs

Backtest completion Valid submitted ≥ 95% in supported test
backtests that finish cases
successfully

Workshop activation Attendees who create ≥ 70%
at least one strategy

Backtest activation Attendees who ≥ 60%
complete at least one
backtest

Time to first backtest Time from onboarding Measure; optimize
to first completed  
backtest

7-day return rate Activated users Establish baseline
returning within  
seven days

Willingness to pay Users expressing Qualitative validation
credible intent to  
pay
-------------------------------------------------------------------------------

Targets are provisional. Workshop attendance and cohort size must be
confirmed before setting absolute user-count targets.

### Non-goals for the MVP

-   Live trading or exchange order execution.
-   Exchange API key management.
-   Paper trading with real-time prices.
-   Multi-exchange account management.
-   Arbitrary Python/JavaScript strategy execution.
-   Strategy marketplace or copy trading.
-   Subscription billing.
-   Portfolio optimization.
-   Mobile native applications.
-   Advanced portfolio-level risk management.

---

## 6. MVP Scope

### P0 --- Must have

---

Feature Requirement

---

Authentication Users can register, log in, and
access their own resources.

Strategy workspace Users can create, view, edit, and
save strategies.

Natural-language input Users can describe a strategy in
plain language.

AI strategy generation The system returns a structured
strategy specification.

Clarification and review The user can inspect assumptions
and resolve ambiguous rules.

Strategy editor Users can edit supported parameters
and conditions without code.

Validation Invalid or unsupported
configurations are rejected with
actionable errors.

Historical market data The system can retrieve and cache
OHLCV candles for supported
markets.

Backtesting A deterministic engine simulates
supported strategies against
historical candles.

Simulation assumptions Fees, slippage, initial capital,
and position sizing are explicit.

Results dashboard Users see performance summary,
equity curve, and trade history.

Version snapshots Every backtest is tied to an
immutable strategy version and
configuration.

Error states AI, market-data, and backtest
failures have understandable
user-facing messages.
-----------------------------------------------------------------------

### P1 --- Should have if time permits

-   Prebuilt strategy templates.
-   AI explanation of entry and exit rules.
-   Strategy version comparison.
-   Downloadable trade history (CSV).
-   Date-range presets.
-   More indicator types.
-   Guided onboarding for beginners.
-   Shareable read-only strategy result.

### P2 --- Later

-   Paper trading.
-   Live execution.
-   Exchange account integration.
-   Advanced order types.
-   Strategy marketplace.
-   Team workspaces.
-   Billing and subscriptions.
-   Portfolio-level analytics.

### MVP support constraints

Initial supported scope should remain intentionally narrow:

-   One historical market-data source.
-   A small, documented set of spot symbols (initial candidate: BTC/USDT
    and ETH/USDT).
-   One-hour and four-hour candles initially.
-   Long-only spot simulation.
-   A limited indicator set, initially EMA and RSI; add more only after
    tests pass.
-   No leverage, shorting, derivatives, funding rates, or liquidation
    simulation in the first release.

The exact provider, symbol availability, historical depth, and rate
limits must be verified during implementation.

---

## 7. Functional Requirements

### FR-01 --- Account and workspace

-   A user can register and authenticate.
-   A user can create and access only their own strategies and
    backtests.
-   The application must enforce authorization server-side, not only in
    the UI.

### FR-02 --- Strategy creation

-   A user can start from natural language or a supported template.
-   The user selects or confirms market, symbol, timeframe, and strategy
    direction.
-   The application retains the original user description for
    traceability.
-   A strategy can have multiple immutable versions.

### FR-03 --- AI generation

-   The AI must output only the supported StrategySpec structure.
-   The server validates output against a versioned schema.
-   Unsupported indicators, operators, timeframes, or risk rules must be
    rejected or clarified.
-   The AI must not silently invent missing thresholds or trading
    assumptions.
-   Ambiguous instructions should produce clarification questions.
-   AI output is a proposal; the user must review and confirm it before
    backtesting.

### FR-04 --- Strategy editing

-   Users can edit supported fields using forms or a visual rule editor.
-   Users do not need to edit raw JSON.
-   Every saved change creates a new strategy version.
-   The UI clearly distinguishes the current draft from previously
    tested versions.

### FR-05 --- Market data

-   The backend fetches historical OHLCV data from the selected
    provider.
-   Data is normalized to a canonical format and timezone (UTC).
-   The system validates timestamps, duplicate candles, missing
    intervals, and invalid OHLCV values.
-   Cached data can be reused for subsequent backtests.
-   The user can see the selected symbol, timeframe, and date range.

### FR-06 --- Backtesting

-   A user can select initial capital, date range, fee assumption,
    slippage assumption, and supported position sizing.
-   Backtests run asynchronously.
-   The UI exposes queued, running, completed, and failed states.
-   The engine processes candles chronologically and does not use future
    candle information.
-   A strategy with identical version, data, and configuration must
    produce reproducible results.
-   The engine records enough metadata to reproduce or audit a result.

### FR-07 --- Results

The results view should include, where applicable:

-   Net return and ending equity.
-   Maximum drawdown.
-   Win rate.
-   Number of closed trades.
-   Profit factor.
-   Average trade return.
-   Equity curve.
-   Trade list with timestamps, side, entry, exit, fees, and P&L.
-   Backtest assumptions and data range.

Metrics must be defined consistently. Do not display a metric if the
engine cannot calculate it correctly.

### FR-08 --- Strategy library

-   Users can list, open, rename, and archive their strategies.
-   Each strategy shows its latest version and latest backtest status.
-   Backtests remain linked to the exact immutable version used.

### FR-09 --- Workshop readiness

-   The workshop flow must not require exchange API keys.
-   The product should offer at least one prebuilt strategy template as
    a fallback.
-   A seeded demo account or facilitator demo mode should be available
    if feasible.
-   The facilitator must have a known-good demo strategy and backtest
    before the event.
-   A backup recording/screenshots or locally available demonstration
    should be prepared in case of connectivity or provider failure.

---

## 8. UX and Information Architecture

### Primary navigation

-   Dashboard
-   My Strategies
-   Strategy Builder
-   Backtest History
-   Learn / Help
-   Account

### Strategy Builder screen

1.  Natural-language description input.
2.  Market configuration.
3.  AI-generated rule summary.
4.  Clarification prompts, if required.
5.  Editable entry, exit, and risk sections.
6.  Validation status.
7.  Save version and run backtest actions.

### Backtest results screen

1.  Strategy name and version.
2.  Market, timeframe, and date range.
3.  Simulation assumptions.
4.  Performance summary.
5.  Equity curve.
6.  Trade history.
7.  Limitations and interpretation notes.
8.  Create a new version / iterate action.

### UX principles

-   Plain language first; technical details available progressively.
-   Show rules in readable form, not raw JSON.
-   Make AI assumptions visible.
-   Never present simulated performance as expected future returns.
-   Make errors actionable.
-   Use clear loading and progress states for backtests.
-   Explain technical terms contextually for beginners.

---

## 9. Safety, Trust, and Disclosures

-   The MVP is simulation-only.
-   No live order execution or custody of funds.
-   No exchange API secrets should be requested or stored.
-   Never claim or imply guaranteed profits.
-   Historical performance is not indicative of future results.
-   Show data range, fees, slippage, and other assumptions alongside
    results.
-   Clearly disclose that real execution may differ due to liquidity,
    latency, market impact, and exchange rules.
-   Do not let an LLM directly execute arbitrary code.
-   Treat user prompts and generated specifications as untrusted input.
-   Apply per-user resource limits to prevent expensive or abusive
    backtest requests.
-   Avoid presenting outputs as personalized financial advice.

---

## 10. Dependencies and Open Decisions

The following must be confirmed or decided:

---

Topic Current proposal Status

---

Product name AI Trading Strategy Lab Provisional

Workshop date December 2026 Exact date TBD

Workshop duration 3h for traders / 4h for Confirm with BlockDev
beginners

Audience Two possible profiles Confirm with BlockDev

Cohort size Unknown TBD

Market-data provider CCXT-compatible Verify
exchange source or  
provider

LLM provider OpenAI-compatible Select provider
structured output

Hosting VPS/EC2 + Docker Confirm capacity

Supported symbols BTC/USDT, ETH/USDT Verify provider
candidate

Historical depth TBD based on provider Verify

Authentication Email/password or Decide
supported auth provider

Platform access after Desired Negotiate with BlockDev
event

IP ownership and Platform owned by Confirm in writing
commercial terms product creator;  
partner terms to be  
agreed
-----------------------------------------------------------------------

---

## 11. Release Plan

### Phase 0 --- Product definition

-   Confirm workshop audience, date, duration, and cohort.
-   Finalize StrategySpec v1.
-   Choose market-data and LLM providers.
-   Freeze MVP scope.

### Phase 1 --- Foundation

-   Application skeleton and authentication.
-   Database schema.
-   Strategy CRUD and versioning.
-   Historical OHLCV ingestion and normalization.

### Phase 2 --- Core intelligence and simulation

-   AI generation and clarification.
-   Schema and semantic validation.
-   Indicator calculations.
-   Backtesting engine.
-   Fee and slippage modeling.

### Phase 3 --- User experience

-   Strategy builder UI.
-   Results dashboard.
-   Trade history.
-   Strategy library.
-   Error handling and onboarding.

### Phase 4 --- Workshop readiness

-   Deploy production-like environment.
-   Test with 3--5 non-technical users.
-   Fix onboarding blockers.
-   Prepare templates and demo fallback.
-   Rehearse the workshop end-to-end.

### Release gate

Do not use the platform as the primary hands-on workshop tool until: -
Core user journey works end-to-end. - Backtest results pass
deterministic and correctness tests. - No cross-user data access is
possible. - Rate limits and resource limits are enabled. - A known-good
fallback demo is ready.

---

## 12. Post-MVP Product Hypotheses

These are hypotheses to validate, not committed features.

1.  Users may pay for higher backtest limits or longer historical data.
2.  Users may pay for advanced indicators and strategy comparison.
3.  Users may return to iterate on strategies if version history is
    useful.
4.  A guided beginner learning path may improve activation.
5.  Paper trading may be the next meaningful feature after historical
    backtesting.
6.  Live execution should only be considered after demand, security,
    compliance, and operational requirements are understood.

---

## 13. Definition of MVP Success

The MVP is successful if a non-technical participant can independently:

1.  Describe a supported trading idea.
2.  Generate a structured strategy.
3.  Understand and edit its rules.
4.  Save a strategy version.
5.  Run a historical backtest.
6.  Interpret the main performance and risk metrics.
7.  Return later and continue iterating.

The product succeeds beyond the workshop if users return, create
additional strategy versions, and demonstrate willingness to pay for
continued value.
