# Token Radar — every protocol with no token yet

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Thabiiey411beta/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Thabiiey411beta/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built for the make.fun bounty
[token-radar-01](https://make.fun/bounty/token-radar-01): it reads a sealed
snapshot of every protocol DefiLlama tracks, finds the ones that record no
token, ranks them by what a launch would be worth, and shows a reader how to
farm each one.

## What it does

`main.ts` (Node 22, standard library only) reads `snapshot.json`, scores all
342 pre-token protocols with model **radar-2**, writes the ranked board to
`/output/board.json`, the dashboard's data to `/output/data.js`, copies
`dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`
with the vendored make.fun library.

## The model (radar-2)

Implied value follows only from the snapshot's own figures — no protocol name
is special-cased:

```
implied = TVL × 0.30 × growth × maturity × farmability × breadth
growth     = 1 + clamp(change_7d, −60, +150) / 100 × 0.6
maturity   = 0.70 + 0.30 × min(age_days, 1095) / 1095   (age unknown: 365 days)
breadth    = 1 + 0.02 × min(chains − 1, 5)
```

Farmability is the model's answer to the snapshot's trap: the biggest
pre-token protocols by TVL are exchanges, bridges and wrapped products that
record no token only because they are products of tokens that already trade.
A CEX, a bridge or a liquid-staking product scores 0.02, while a
standard protocol scores 1.00 — so the board's top is the protocols that
could actually launch, not the exchanges that never will. Ties are broken by
$1 so the board is strictly ranked.

## The dashboard

A static page, no network: a sortable, filterable board of all 342 pre-token
protocols (watchlist starred), a detail view per protocol with the value
breakdown and its six farm steps, a live-tokens tab that sets the traded
protocols aside with the market's own values, and a model tab stating the
formula in full. Run it locally with:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

then open `out/dashboard/index.html` in a browser.

## Honest limits

“Records no token” means the protocol's DefiLlama record carries no token —
it is not proof the protocol has none. The implied value is this entry's own
claim about what a launch would be worth if the protocol's record stayed as
it is; it does not predict whether or when a token is issued.
