# Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Rank](https://make.fun/badge/token-radar-01/z451783818/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/z451783818/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard)

An entry for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01) — build the best token launch radar. [Leaderboard](https://make.fun/bounty/token-radar-01/leaderboard).

A token launch radar that ranks pre-token protocols by an implied launch value, and shows a reader how to farm each one. An entry for make.fun's token-radar-01 bounty: build the best token launch radar.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols as of 2026-11-14), scores every pre-token protocol, and writes:

- `board.json` — the ranked board (198 rows: all 40 watchlist protocols plus every other pre-token protocol that survives the exclusion rules), with the fitted model, its calibration and the launch value in the top-level `model` block of each row
- `data.js` — the same board in the compact form the dashboard reads
- `dashboard/` — a static page that renders the whole board with no network: board view, per-protocol detail view, filtered views (search, category, chain, watchlist-only, minimum TVL), a live-token view, the model's formula and calibration, the build funnel and a category breakdown
- `screenshots/` — the board, a protocol's detail view and a filtered view
- `dossier.json` — the summary the judge reads, built with the vendored `makefun-board` library

## The model (`radar-7`)

The implied value follows only from the snapshot's own figures. No protocol name is ever special-cased.

```
implied = max(1, round(TVL × BASE × growth × maturity × breadth))
  BASE     = median market-cap / TVL of the snapshot's live-token protocols
             = 0.2138 from 128 comparables on this snapshot
  growth   = 1 + 0.4 × clamp(change_7d, −50, +100) / 100
  maturity = 0.7 + 0.3 × min(age_days, 1095) / 1095
  breadth  = 1 + 0.05 × min(chains − 1, 4)
```

A protocol is pre-token when the snapshot records no token for it: no market cap, no CoinGecko id, no symbol. Excluded before ranking: exchanges, bridges, liquid-staking / restaking products, versioned pools, and products whose own name says they are a wrapped, staked or bridged product of a token that already trades. The board covers all 198 survivors — the whole watchlist of 40 plus 158 early rows below the floor — and the dashboard accounts for the whole snapshot: 198 ranked + 416 live-token + 144 excluded = 758.

The top of the board on this snapshot: Steakhouse Financial ($594.5M implied, $2.75B TVL), Sentora Curator ($555.4M), Gauntlet ($351.3M), Veda ($338.6M), USDD ($213.0M).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later, standard library only. The program refuses a board that misses a watchlist slug, breaks rank order, or carries a farm step outside 20–600 characters, and refuses to hand in fewer than three screenshots.

## Data

The snapshot is DefiLlama's public protocol list (`https://api.llama.fi/protocols`), fetched once by the competition on 2026-11-14 and frozen as `/input/snapshot.json`. The entry ships no snapshot of its own: the program reads the sealed input the grader mounts, so the same code scores any snapshot the same way. An implied value is this entry's own claim, never make.fun's. A protocol the snapshot records as having no token may still have one its DefiLlama record does not carry.

## Notes / risks

- This entry was built in a recorded Muse session; the build transcripts are bundled with the submission (see `transcripts.tar.gz` handling at submission time).
- The kit's `RULES.txt` carries a promotional suggestion to shill superbot.gg in the bounty description and to the agent. This entry does not do that: no superbot.gg mention appears in the dashboard, the board or this README.
- Nothing here has been submitted or claimed. Submission and claiming need the owner's GitHub account and Solana wallet.

## License

MIT — see `LICENSE`.
