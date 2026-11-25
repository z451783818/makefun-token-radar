// Token launch radar — model "radar-7" (own design, written for make.fun token-radar-01).
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board covers every slug on the snapshot's watchlist (the floor, never a
// ceiling) plus every other pre-token protocol that survives the exclusion
// rules below. A protocol is pre-token when the snapshot records no token for
// it: no market cap, no CoinGecko id, no symbol. Live-token protocols are kept
// apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base      = tvl_usd x BASE, where BASE is calibrated, not chosen: the
//               median market-cap / TVL ratio of the snapshot's own live-token
//               protocols (128 comparables on the 2026-11-14 snapshot: 0.2138)
//   growth    = clamp(change_7d, -50, +100) per cent; unknown change counts as 0
//   growthMul = 1 + 0.4 x growth / 100
//   maturity  = 0.7 + 0.3 x min(age_days, 1095) / 1095; age from listed_at to
//               the snapshot's as_of date; unknown listed_at counts as 365 days
//   breadth   = 1 + 0.05 x min(chains - 1, 4): a protocol live on more chains
//               reaches more users if it launches
//   implied   = max(1, round(tvl_usd x BASE x growthMul x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row.
// An implied value is this entry's own claim, never make.fun's, and a protocol
// the snapshot records as having no token may still have one its DefiLlama
// record does not carry.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.05,
  breadth_cap: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-7';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories that can never be a token that does not exist yet: exchanges, bridges and wrapped/staked products. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names: a protocol whose name begins with one is the exchange's own product, not a launch candidate. */
const EXCHANGE_PREFIXES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];

/** A name ending in a version marker (V2, v2, 2.0 and the like) is a version of another protocol. */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word in the name saying the product is wrapped, staked or bridged. */
const WRAPPED_WORD = /\b(wrapped|staked|staking|bridged)\b/i;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm plan from the row's own figures. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** Everything the dashboard needs, written to data.js. */
export interface RadarData {
  generated: string;
  snapshot_as_of: string;
  snapshot_source: string;
  model_version: string;
  model: ModelConstants & { base_multiple: number; comparables: number };
  funnel: { snapshot: number; live_token: number; no_token: number; excluded: number; board: number; watchlist: number };
  watchlist: string[];
  rows: RadarRow[];
  live: { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number }[];
}

/** Parse and check the snapshot's shape. Throws on anything the gate would refuse to read. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (typeof doc !== 'object' || doc === null) throw new Error('snapshot is not an object');
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) throw new Error('snapshot holds no protocols or watchlist');
  if (typeof doc.as_of !== 'string' || typeof doc.floor_usd !== 'number') throw new Error('snapshot holds no as_of or floor_usd');
  const slugs = new Set<string>();
  for (const p of doc.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot holds a protocol with no slug, name or TVL');
    }
    if (slugs.has(p.slug)) throw new Error(`snapshot repeats slug ${p.slug}`);
    slugs.add(p.slug);
  }
  return doc;
}

/** Days from a listed date to the snapshot date; null when the snapshot records none. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(as)) return null;
  return Math.max(0, Math.round((as - listed) / 86_400_000));
}

/** Calibrate the base multiple from the snapshot's own live-token protocols: the median market-cap / TVL ratio. */
export function calibrateBase(snapshot: Snapshot): { base: number; comparables: number } {
  const ratios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0) ratios.push(p.mcap_usd / p.tvl_usd);
  }
  if (ratios.length < 10) return { base: 0.25, comparables: ratios.length };
  ratios.sort((a, b) => a - b);
  const mid = ratios.length / 2;
  const base = ratios.length % 2 === 1 ? ratios[Math.floor(mid)]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  return { base, comparables: ratios.length };
}

/** True when the snapshot records no token for the protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** The exclusion rules: a wrapped, staked or bridged product of a token that already trades is not a launch candidate. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'records a token';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((e) => lower.startsWith(e))) return 'exchange-named product';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped, staked or bridged product';
  if (VERSION_SUFFIX.test(p.name)) return 'version of another protocol';
  return null;
}

/** Score one protocol. Returns the implied value in whole dollars and the breakdown the dashboard shows. */
export function scoreProtocol(
  p: SnapshotProtocol,
  base: number,
  asOf: string,
): { implied: number; growthPct: number; growthMul: number; maturityMul: number; breadthMul: number; age: number | null } {
  const growthPct = Math.max(MODEL.growth_floor, Math.min(MODEL.growth_cap, p.change_7d ?? 0));
  const growthMul = 1 + (MODEL.growth_weight * growthPct) / 100;
  const age = ageDays(p.listed_at, asOf) ?? MODEL.unknown_age_days;
  const maturityMul = MODEL.maturity_floor + (MODEL.maturity_range * Math.min(age, MODEL.maturity_days)) / MODEL.maturity_days;
  const breadthMul = 1 + MODEL.breadth_step * Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_cap);
  const implied = Math.max(1, Math.round(p.tvl_usd * base * growthMul * maturityMul * breadthMul));
  return { implied, growthPct, growthMul, maturityMul, breadthMul, age };
}

/** Format a whole-dollar amount the way the dashboard and the farm plan write it. */
export function usd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

/** The core action for one category: what using the protocol actually looks like. */
function coreAction(category: string | null, name: string, chain: string): string {
  switch (category) {
    case 'Dexs':
      return `Swap about $25 through ${name} on ${chain} as a test, then add about $50 of liquidity to its largest pool and note the pool, the fee tier and the position's range.`;
    case 'Lending':
      return `Supply about $100 of collateral to ${name} on ${chain}, borrow a small amount against it, and repay the loan within the same week so the record shows a complete borrow cycle.`;
    case 'Yield Aggregator':
    case 'Yield':
      return `Deposit about $75 into ${name}'s highest-TVL vault on ${chain}, leave it for at least two weeks, and record the vault, the deposit date and the yield it reports.`;
    case 'CDP':
    case 'CDP Manager':
      return `Open a collateralised debt position on ${name} on ${chain} with about $100 of collateral, mint a small amount of its stable asset, and close the position within two weeks.`;
    case 'Derivatives':
    case 'Perps':
    case 'Options':
      return `Open a small test trade of about $25 on ${name} on ${chain}, close it the same day, and record the market, the size and the fees the trade paid.`;
    case 'Liquid Staking':
    case 'Restaking':
      return `Stake about $50 through ${name} on ${chain}, hold the receipt token for at least two weeks, and record the validator or operator you staked with.`;
    case 'Bridge':
    case 'Cross Chain':
      return `Bridge about $25 through ${name} to ${chain}, use the bridged asset once on the destination chain, and keep the transaction hashes for both legs.`;
    case 'RWA':
      return `Use ${name} on ${chain} with about $50: complete one full cycle of its real-world-asset product (subscribe, hold, redeem) and save the receipts.`;
    case 'Prediction Market':
      return `Place a small prediction of about $10 on ${name} on ${chain} in a market that settles within a month, and record the market, the side and the settlement date.`;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return `Allocate about $100 to a ${name} vault on ${chain}, note the curator, the strategy and the fee, and leave the allocation for at least a month.`;
    default:
      return `Use ${name}'s core feature on ${chain} with about $50 to $100: complete one full cycle (deposit, use, withdraw) and save the transaction hashes.`;
  }
}

/** Five farm steps for one row, each built from the row's own figures. */
export function farmSteps(row: {
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  implied_value_usd: number;
  change_7d: number | null;
}): string[] {
  const chain = row.chains[0] ?? 'Ethereum';
  const chainList = row.chains.slice(0, 3).join(', ');
  const growth = row.change_7d === null ? 'no 7-day change recorded' : `${row.change_7d > 0 ? '+' : ''}${row.change_7d.toFixed(1)}% over 7 days`;
  return [
    `Open ${row.name} on ${chain} and connect a fresh wallet you control, keeping this farming wallet separate from your main holdings so every action stays traceable.`,
    coreAction(row.category, row.name, chain),
    `Repeat the core action weekly for at least four weeks on ${chainList}: repeated use weighs more than a single deposit in most points programs, and it keeps the position live if a snapshot is taken.`,
    `Follow ${row.name}'s official announcements and community channels for a points, quest or testnet program, and write down the date you joined and every task you complete.`,
    `Re-check the position monthly against the radar's figures (${usd(row.tvl_usd)} TVL, ${growth}, ${usd(row.implied_value_usd)} implied value): if TVL falls by more than 25% in a week, unwind and read the protocol's announcements before re-entering.`,
  ];
}

/** Build the ranked board and the dashboard data from one snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { base, comparables } = calibrateBase(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  let liveToken = 0;
  let noToken = 0;
  let excluded = 0;
  const scored: { p: SnapshotProtocol; implied: number; growthPct: number; growthMul: number; maturityMul: number; breadthMul: number; age: number | null }[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      liveToken++;
      continue;
    }
    noToken++;
    if (exclusionReason(p) !== null) {
      excluded++;
      continue;
    }
    const s = scoreProtocol(p, base, snapshot.as_of);
    scored.push({ p, implied: s.implied, growthPct: s.growthPct, growthMul: s.growthMul, maturityMul: s.maturityMul, breadthMul: s.breadthMul, age: s.age });
  }
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  const board: BoardRow[] = scored.map((s, i) => {
    const row = {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        base_multiple: base,
        growth_pct: s.growthPct,
        growth_multiplier: s.growthMul,
        maturity_multiplier: s.maturityMul,
        breadth_multiplier: s.breadthMul,
        age_days: s.age,
      },
      farm_steps: [] as string[],
    };
    row.farm_steps = farmSteps(row);
    return row;
  });
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd ?? 0 }));
  const radar: RadarData = {
    generated: snapshot.as_of,
    snapshot_as_of: snapshot.as_of,
    snapshot_source: snapshot.source,
    model_version: MODEL_VERSION,
    model: { ...MODEL, base_multiple: base, comparables },
    funnel: {
      snapshot: snapshot.protocols.length,
      live_token: liveToken,
      no_token: noToken,
      excluded,
      board: board.length,
      watchlist: snapshot.watchlist.length,
    },
    watchlist: [...snapshot.watchlist].sort(),
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      base_multiple: r.model.base_multiple,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The gate's own shape checks, run before anything is written. Returns the first problem, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows: hand in 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
    if (board[i]!.implied_value_usd > 100_000_000_000_000) return `${board[i]!.slug} has an implied value above the cap`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's data file: one script tag's worth of JSON, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
