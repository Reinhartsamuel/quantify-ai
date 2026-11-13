# Design review and anti-slop gates

Direction: **research terminal, not crypto casino.** Data-dense, calm, editorial. Warm paper in
light mode, graphite in dark mode. One restrained accent. Motion is limited to 120–180 ms state
changes; no parallax, glow, or looping animation.

## Design system

- Semantic CSS variables only (`apps/web/src/app/globals.css`). Components do not use raw hex.
- Light default, dark secondary, system preference respected, stored choice survives navigation.
- Type: Instrument Sans UI, Instrument Serif editorial/auth, IBM Plex Mono for prices, metrics,
  timestamps, and tables. `font-variant-numeric: tabular-nums` on data.
- Scale: 12/13/14/16/20/28/40 px; UI text never below 12 px.
- 4 px spacing grid, 1 px hairlines, 4/6/10 px radii, no decorative shadows.
- Lucide icons at 14–20 px; no emoji as icons.
- Charts: lightweight-charts, accent equity and negative drawdown, crosshair readout, explicit
  units in the summary, and a “View as table” fallback for every chart.
- IA: Dashboard, Strategies, Backtests, Learn, Account; left rail desktop, bottom tab bar mobile.
- Every screen has empty, loading, error, and success states; results always show assumptions and
  the simulation disclosure.

## Anti-slop checklist

Hard failures checked:

- [x] No invented statistics, testimonials, logos, or “trusted by” strip.
- [x] No fake form success; every form submits to the API or shows a real error.
- [x] Reduced-motion preference respected (`@media (prefers-reduced-motion: reduce)`).
- [x] Simulated results never presented as expected returns; disclosure on results/share pages.
- [x] Focus is visible; links and controls have keyboard affordances.
- [x] Mobile breakpoints at 900 px and 600 px; touch targets sized by button/input minimums.
- [ ] Contrast measured with axe on staging (static tokens follow the Phase 4 palette; browser run
      pending).
- [ ] Screenshot review at 375/768/1024/1440 both themes (browser run pending).

Reflex failures avoided: no eyebrow on every heading, no tracked-out all-caps labels, no colored
word in headlines, no purple/pink gradients, neon, glassmorphism, 3D blobs, hero art, three-column
icon feature grid, fake social proof, or vague hype copy.

## Static check result

`bun run scripts/design-check.ts` scans 31 source files and verifies:

- semantic color tokens only (0 raw hex outside the token block);
- tabular numerals, visible focus, reduced motion, mobile breakpoints;
- labeled forms, no fake social proof, no forbidden hype copy or visual effects.

Latest: **pass** — `docs/evidence/design-check.json`.

## Browser gate (pending)

The host's Chromium is not runnable (Android/musl; bundled binaries fail relocation), so the
following must be completed on staging before final sign-off:

```bash
node skills/hallmark/scripts/sloplint.mjs apps/web --render   # if Hallmark is installed
npx @axe-core/cli http://staging.example --exit
```

Then capture sign-in, dashboard, builder, result, and share pages at 375/768/1024/1440 in both
themes and have a fresh-context reviewer inspect them. Re-run after any visual change.
