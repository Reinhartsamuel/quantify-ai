# Usability rehearsal

Goal: verify that a non-technical participant can complete the core loop without facilitator help.

## Participants

3–5 people matching the workshop audience (traders who do not code, plus at least one complete
beginner). Do not use the facilitator or the implementation team.

## Protocol (45 minutes per participant)

1. Give the participant the one-page handout and the URL. Do not demo first.
2. Ask them to think aloud. Record blockers and hesitation, not just task failure.
3. Tasks:
   1. Sign up or sign in.
   2. Find a template and create a strategy.
   3. Explain what the entry and exit rules mean in their own words.
   4. Change one parameter and save a new version.
   5. Run a backtest over 2025-01-01 → 2025-07-01.
   6. Read net return, max drawdown, trades, and one assumption.
   7. Download the CSV and create a share link.
   8. Find `/learn`, then explain one limitation of backtesting.
4. Stop only if the participant is stuck for more than five minutes; note the blocker and help.
5. Ask: “What would make you trust or distrust this result?” and “What would you do next?”

## Pass criteria

- All 5 participants complete tasks 1–6 unaided in ≤ 15 minutes.
- At least 4/5 complete tasks 7–8 unaided.
- No participant believes the result is a guarantee of future profit after the disclosure is shown.
- No critical accessibility blocker: keyboard-only path works; focus is visible; 200% zoom usable.
- No participant asks for raw JSON to understand the rules.

## Observation template

| Participant | Segment | Tasks 1–6 | Tasks 7–8 | Time | Blockers | Quote |
| ----------- | ------- | --------- | --------- | ---- | -------- | ----- |
| P1          |         |           |           |      |          |       |
| P2          |         |           |           |      |          |       |
| P3          |         |           |           |      |          |       |
| P4          |         |           |           |      |          |       |
| P5          |         |           |           |      |          |       |

## Findings to fix before the workshop

Record each finding with severity (blocker / friction / polish), owner, and a link to the change.
Do not add new features during this pass; fix onboarding, labels, errors, and layout.

## Browser/accessibility checks

On staging, at 375/768/1024/1440 px and in both themes:

- run `npx @axe-core/cli <url> --exit` on sign-in, dashboard, builder, and result;
- verify focus order and dialog focus restoration;
- verify charts have a table fallback and accessible names;
- verify 200% zoom and `prefers-reduced-motion`;
- capture screenshots and store them with the release evidence.

Status: **not yet run** — this host cannot launch Chromium. Complete before sign-off.
