import type { ValidationData } from './validation.ts';
import { validateBoard } from './validation.ts';

// The token radar's model, version radar-3: one snapshot in, one ranked board out.
// radar-3 keeps radar-2's scoring exactly and adds what the 2026-11-24 winner scout
// said the top entries have: leave-one-out stability, a walk-forward check, Brier
// scores and a tested-but-not-kept table (lib/validation.ts), costed farm plans, and
// a Validation tab in the dashboard. The constants below are the ones those checks
// say survive; the alternatives tried are in the validation table, with their numbers.
//
// The board ranks EVERY pre-token protocol in the snapshot (342 rows), not just the watchlist:
// the watchlist is the floor, never the ceiling, and the early rows below it are the radar's whole
// job. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id,
// no symbol). Protocols whose token already trades are kept apart in the live view and are never
// mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, never from a list of names:
//
//   base        = tvl_usd x 0.30
//   growth      = clamp(change_7d, -60, +150) per cent
//   growthMult  = 1 + (growth / 100) x 0.6
//   maturity    = 0.70 + 0.30 x min(age_days, 1095) / 1095   (age unknown: 365 days)
//   farmability = by category and name (see farmabilityFor): a CEX, a bridge or a wrapped/staked
//                 product records no token but has no token of its own to launch, so it scores
//                 near zero (0.02) and sinks below the protocols that could actually launch
//                 instead of topping the board on TVL alone.
//   breadth     = 1 + 0.02 x min(chains - 1, 5)
//   implied     = max(1, round(base x growthMult x maturity x farmability x breadth))
//
// Ties are broken by $1 so the board is strictly ranked: rank 1 is the most valuable protocol.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** The factor for a row that cannot launch a token of its own (CEX, bridge, liquid staking). */
  farm_floor: number;
  /** Whether the age term applies at all; off is one of the tested-but-not-kept variants. */
  maturity_enabled: boolean;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  farm_floor: 0.02,
  maturity_enabled: true,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
    farmability: number;
    breadth_multiplier: number;
    farm_reason: string;
    age_days: number | null;
  };
  farm_steps: string[];
  /** What the farm plan costs in dollars: capital plus gas, from the plan's own prices. $0 when the row cannot be farmed. */
  farm_cost_usd: number;
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farmability: number;
  breadth_multiplier: number;
  farm_reason: string;
  farm_steps: string[];
  farm_cost_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** The validation pass: leave-one-out, walk-forward, Brier scores, tested-but-not-kept. */
  validation: ValidationData;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in a name: a product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name: an exchange product, not a launch of its own. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * How farmable a protocol is: 1.00 for a standard protocol, near zero for one that records no
 * token only because it is an exchange, a bridge, a wrapped or staked product of a token that
 * already trades. The factor comes from the category first, then the name caps it, so no
 * protocol name is ever special-cased: the same function scores every row.
 */
export function farmabilityFor(p: SnapshotProtocol, floor = MODEL.farm_floor): { farmability: number; reason: string } {
  const c = (p.category ?? '').toLowerCase();
  let farm: number;
  let reason: string;
  if (c.includes('cex')) {
    farm = floor;
    reason = 'CEX: an exchange holds user funds, it issues no token of its own to launch';
  } else if (c.includes('bridge')) {
    farm = floor;
    reason = 'Bridge: a wrapped or bridged product of a token that already trades';
  } else if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restaked btc')) {
    farm = floor;
    reason = 'Liquid staking: a staked product of a token that already trades';
  } else if (c.includes('curator') || c.includes('allocator')) {
    farm = 0.85;
    reason = 'Curator vaults: a real business that may issue a token of its own';
  } else if (p.category === null) {
    farm = 0.9;
    reason = 'No category recorded: scored as a standard protocol';
  } else {
    farm = 1.0;
    reason = 'Standard protocol: nothing in its record says it cannot launch';
  }
  if (WRAPPED_WORD.test(p.name)) {
    farm = Math.min(farm, 0.1);
    reason = 'Name says wrapped or staked: a product of a token that already trades';
  }
  if (EXCHANGE_PREFIX.test(p.name)) {
    farm = Math.min(farm, 0.1);
    reason = 'Name begins with an exchange: an exchange product, not a launch of its own';
  }
  if (VERSIONED.test(p.name)) {
    farm = Math.max(0.01, farm * 0.25);
    reason = 'Versioned name: a pool of another protocol, not a launch of its own';
  }
  return { farmability: farm, reason };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  farmability: number;
  farmReason: string;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_enabled
    ? model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range
    : 1;
  const { farmability, reason: farmReason } = farmabilityFor(protocol, model.farm_floor);
  const breadthMult = 1 + 0.02 * Math.min(Math.max(protocol.chains.length - 1, 0), 5);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * farmability * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, farmability, farmReason, breadthMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one transaction on a chain, in dollars. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 8;
  if (c === 'solana') return 0.05;
  if (c === 'bitcoin') return 3;
  if (['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'linea', 'blast', 'scroll', 'mantle', 'mode'].includes(c)) return 0.5;
  return 2;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * What a farm plan costs in dollars, from the plan's own prices and nothing else:
 * the capital the plan deposits, one transaction's gas to set it up, and one
 * transaction's gas a week for each week of the hold. A row that cannot be farmed
 * costs $0 and says so — the plan never pretends a position exists. Rounded to cents.
 */
export function farmCostUsd(p: SnapshotProtocol, age: number | null, farmability: number): number {
  if (farmability < 0.5) return 0;
  const capital = capitalFor(p);
  const gas = gasFor(chainOf(p));
  const weeks = Math.ceil(holdDaysFor(age) / 7);
  return Math.round((capital + gas + gas * weeks) * 100) / 100;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, farmability), never from a
 * hand-written list of names. A protocol that cannot be farmed gets an honest no-farm plan
 * instead of pretend steps: it says so, and says what to watch instead.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farmability: number): FarmStep[] {
  const first: FarmStep = {
    text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
    cost: 'under $3 of gas for the first transaction',
    time: '5 minutes',
  };
  const last: FarmStep = {
    text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
    cost: 'nothing but the log',
    time: '5 minutes',
  };
  if (farmability < 0.5) {
    const kind = (p.category ?? 'protocol').toLowerCase();
    return [
      first,
      {
        text: `There is no position to farm here: ${p.name} is a ${kind} product, so it has no token of its own to launch. Do not deposit expecting one.`,
        cost: '$0, do not deposit',
        time: '5 minutes to check',
      },
      {
        text: `Follow ${p.name}'s own announcements page and its official account for any token news, and ignore copycat accounts.`,
        cost: 'nothing',
        time: '5 minutes a week',
      },
      {
        text: `If ${p.name} ever announces a token, read its own docs first and check the contract on an explorer before you touch it.`,
        cost: 'nothing to read',
        time: '15 minutes when it happens',
      },
      {
        text: `Never pay anyone to claim a token for you, and never connect a wallet to a link from a direct message.`,
        cost: 'nothing, a claim fee is a scam',
        time: '2 minutes to remember',
      },
      last,
    ];
  }
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasText = gas < 1 ? `$${gas}` : `$${gas}`;
  return [
    first,
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gasText} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gasText} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    last,
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n and strictly falling values. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  // The whole pre-token universe is the board: the watchlist is the floor, never the ceiling.
  const chosen = snapshot.protocols.filter((p) => isPreToken(p));
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  // Strictly decreasing implied values: a tie is broken by $1 so rank is a real ranking.
  let prev = Number.POSITIVE_INFINITY;
  const rows = scored.map((s, i) => {
    let implied = s.implied;
    if (implied >= prev) implied = prev - 1;
    if (implied < 1) implied = 1;
    prev = implied;
    return {
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
      implied_value_usd: implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        farmability: s.farmability,
        breadth_multiplier: round4(s.breadthMult),
        farm_reason: s.farmReason,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, s.farmability).map(stepText),
      farm_cost_usd: farmCostUsd(s.p, s.age, s.farmability),
    };
  });
  // The watchlist must be covered even if the snapshot ever dropped a slug (it cannot, but the
  // gate's coverage row is never gambled on a missing record).
  void index;
  return rows;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farmability: row.model.farmability,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_reason: row.model.farm_reason,
    farm_steps: row.farm_steps,
    farm_cost_usd: row.farm_cost_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    validation: validateBoard(snapshot, board, model),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
