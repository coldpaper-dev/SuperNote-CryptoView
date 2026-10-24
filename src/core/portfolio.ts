/**
 * The holdings and the prices put together: one line per coin, a total, and
 * what could not be valued said plainly.
 */
import {Cost, Currency, Quote} from './model';
import {isManualCash} from './manual';
import {Holding} from './readers';
import {USDC_ID} from './tokens';

/** One holding of a line, with what the portfolio worked out for it. */
export interface Part extends Holding {
  /** Where the price paid for it is kept; see costKey. */
  costKey: string;
  value: number | null;
  /**
   * For a staked or wrapped form: how many of the line's coin one of it
   * counts for, from today's prices. null when it is the coin itself.
   */
  factor: number | null;
  /** Paid per coin, in the display currency; null when not known. */
  unitCost: number | null;
  /** As typed, when the user gave it; absent when the exchange did. */
  typed: Cost | null;
  pnl: number | null;
}

export interface Line {
  /** Price id when there is one, else the symbol. */
  key: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number | null;
  value: number | null;
  change24h: number | null;
  /** Value minus price paid, over the parts that have one. */
  pnl: number | null;
  /** The same as a share of what was paid, in percent. */
  pnlPct: number | null;
  /** What the parts with a price paid cost in all; null when none has one. */
  paid: number | null;
  /** That cost per coin of the line: the average price paid. */
  unitCost: number | null;
  /** Some parts have no price paid: the gain covers only the others. */
  pnlPartial: boolean;
  stale: boolean;
  parts: Part[];
}

export interface Portfolio {
  total: number;
  /** Value minus price paid, over every coin that has one; null when none. */
  pnl: number | null;
  /** What those coins cost; a coin received for free adds nothing here. */
  paid: number;
  /** A coin above the dust threshold has no price paid: `pnl` leaves it out. */
  pnlPartial: boolean;
  /**
   * Change of the total, in percent, had the same coins been held all
   * along: only prices move, not balances.
   */
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  lines: Line[];
  /** Lines under the threshold, counted in the total but folded away. */
  dust: Line[];
  unpriced: Line[];
  /** Lines the user hid; not in the total. */
  hidden: Line[];
  stale: boolean;
}

/** Where the price paid for a holding is kept: its read, coin and kind. */
export const costKey = (holding: Holding): string =>
  `${holding.source}|${holding.coinId ?? holding.symbol}|${holding.note ?? ''}`;

const DUST_THRESHOLD = 1;

/**
 * Staked and wrapped forms of a coin, shown on the line of that coin. Each
 * keeps its own price; the line counts what they are worth in the coin.
 */
const FORMS: Record<string, string[]> = {
  solana: [
    'jupiter-staked-sol',
    'msol',
    'jito-staked-sol',
    'blazestake-staked-sol',
    'binance-staked-sol',
    'wrapped-solana',
  ],
  ethereum: [
    'staked-ether',
    'wrapped-steth',
    'rocket-pool-eth',
    'coinbase-wrapped-staked-eth',
    'wrapped-eeth',
    'mantle-staked-ether',
    'kelp-dao-restaked-eth',
    'renzo-restaked-eth',
    'weth',
  ],
  bitcoin: ['wrapped-bitcoin', 'coinbase-wrapped-btc', 'tbtc'],
  hyperliquid: ['wrapped-hype', 'kinetic-staked-hype', 'staked-hype', 'staked-hype-shares'],
  chainlink: ['wrapped-staked-link'],
  'avalanche-2': ['benqi-liquid-staked-avax', 'wrapped-avax'],
  binancecoin: ['wbnb'],
  near: ['wrapped-near', 'staked-near', 'linear-protocol'],
};
const FORM_OF = new Map<string, string>();
for (const coin of Object.keys(FORMS)) {
  FORMS[coin].forEach(form => FORM_OF.set(form, coin));
}

/**
 * What one US dollar is worth in the display currency: 1 in dollars, else
 * taken from the price of USDC. null when it cannot be told yet.
 */
export function usdRate(
  currency: Currency,
  quotes: Record<string, Quote>,
): number | null {
  return currency === 'usd' ? 1 : quotes[USDC_ID]?.price ?? null;
}

export interface PortfolioOptions {
  /** Value under which a line is dust, in the display currency. */
  dust?: number;
  /** Keys of the lines left out of the total. */
  hidden?: string[];
  /** Prices the user paid, by costKey. */
  costs?: Record<string, Cost>;
  /** The display currency, and euros for one dollar: to convert a cost. */
  currency?: Currency;
  usdEur?: number | null;
}

export function buildPortfolio(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  /** Value of one US dollar in the display currency; see usdRate. */
  dollar: number | null = null,
  options: PortfolioOptions = {},
): Portfolio {
  const threshold = options.dust ?? DUST_THRESHOLD;
  const hiddenKeys = new Set(options.hidden ?? []);
  // USDC is one dollar by decision, whatever the market says today. A coin
  // the price source does not know takes the chain's own price.
  const priceOf = (holding: Holding): number | null =>
    holding.coinId === USDC_ID && dollar !== null
      ? dollar
      : (holding.coinId ? quotes[holding.coinId]?.price : undefined) ??
        (holding.usd != null && dollar !== null ? holding.usd * dollar : null);

  const {costs = {}, currency, usdEur = null} = options;
  // A price paid is converted at today's rate, not the rate of the day.
  const typedCost = (cost: Cost | undefined): number | null => {
    if (!cost || !(cost.price >= 0)) {
      return null;
    }
    if (!currency || cost.currency === currency) {
      return cost.price;
    }
    if (usdEur === null || !(usdEur > 0)) {
      return null;
    }
    return cost.currency === 'usd' ? cost.price * usdEur : cost.price / usdEur;
  };

  const byKey = new Map<string, Line>();
  const paid = new Map<string, number>();
  /** Coins of each line that have a price paid, counted in the line's coin. */
  const costed = new Map<string, number>();
  const usedKeys = new Set<string>();
  for (const holding of holdings) {
    const own = priceOf(holding);
    // A staked or wrapped form joins its coin when both have a price.
    const parent = holding.coinId ? FORM_OF.get(holding.coinId) : undefined;
    const parentPrice = parent ? quotes[parent]?.price ?? null : null;
    const joins = !!parent && own !== null && parentPrice !== null && parentPrice > 0;
    const key = joins ? parent! : holding.coinId ?? `?${holding.symbol}`;
    let line = byKey.get(key);
    if (!line) {
      const quote = quotes[key];
      line = {
        key,
        symbol: quote?.symbol ?? holding.symbol,
        name: quote?.name ?? holding.name,
        quantity: 0,
        price: joins ? parentPrice : own,
        value: null,
        change24h: quote?.changes.h24 ?? null,
        pnl: null,
        pnlPct: null,
        paid: null,
        unitCost: null,
        pnlPartial: false,
        stale: false,
        parts: [],
      };
      byKey.set(key, line);
    }
    if (line.price === null && own !== null && !joins) {
      line.price = own;
    }
    const value = own === null ? null : holding.quantity * own;
    line.quantity += joins ? value! / parentPrice! : holding.quantity;
    if (value !== null) {
      line.value = (line.value ?? 0) + value;
    }
    line.stale = line.stale || !!holding.stale;
    // Two holdings can share a key (two vaults, USDC and its bridged form
    // on one chain): the first keeps it, so that prices already typed stay.
    let partKey = costKey(holding);
    for (let n = 2; usedKeys.has(partKey); n++) {
      partKey = `${costKey(holding)}|${holding.symbol}#${n}`;
    }
    usedKeys.add(partKey);
    // Zero is a price paid too: a coin received for free.
    const typed = costs[partKey] && costs[partKey].price >= 0 ? costs[partKey] : null;
    const unitCost =
      typedCost(typed ?? undefined) ??
      (typed === null && holding.cost != null && dollar !== null
        ? holding.cost * dollar
        : null);
    const pnl =
      value !== null && unitCost !== null ? value - holding.quantity * unitCost : null;
    if (pnl !== null) {
      line.pnl = (line.pnl ?? 0) + pnl;
      paid.set(key, (paid.get(key) ?? 0) + holding.quantity * unitCost!);
      costed.set(
        key,
        (costed.get(key) ?? 0) + (joins ? value! / parentPrice! : holding.quantity),
      );
    } else if (
      value !== null &&
      holding.coinId !== USDC_ID &&
      !isManualCash(holding)
    ) {
      line.pnlPartial = true;
    }
    line.parts.push({
      ...holding,
      costKey: partKey,
      value,
      factor: joins ? own! / parentPrice! : null,
      unitCost,
      typed,
      pnl,
    });
  }
  let total = 0;
  const before = {h24: 0, d7: 0, d30: 0};
  const all = [...byKey.values()];
  const shown = all.filter(line => !hiddenKeys.has(line.key));
  let pnl: number | null = null;
  let spent = 0;
  let pnlPartial = false;
  for (const line of shown) {
    if (line.pnl !== null) {
      pnl = (pnl ?? 0) + line.pnl;
      spent += paid.get(line.key) ?? 0;
    }
    pnlPartial = pnlPartial || (line.pnlPartial && (line.value ?? 0) >= threshold);
  }
  for (const line of all) {
    line.parts.sort((x, y) => (y.value ?? 0) - (x.value ?? 0) || y.quantity - x.quantity);
    const cost = paid.get(line.key) ?? 0;
    line.pnlPct = line.pnl !== null && cost > 0 ? (line.pnl / cost) * 100 : null;
    const coins = costed.get(line.key) ?? 0;
    line.paid = line.pnl !== null ? cost : null;
    line.unitCost = line.pnl !== null && coins > 0 ? cost / coins : null;
    line.pnlPartial = line.pnlPartial && line.pnl !== null;
  }
  for (const line of shown) {
    if (line.value !== null) {
      total += line.value;
      // What the same coins were worth then; a coin with no history is
      // taken as unchanged.
      const changes = quotes[line.key]?.changes;
      before.h24 += line.value / (1 + (changes?.h24 ?? 0) / 100);
      before.d7 += line.value / (1 + (changes?.d7 ?? 0) / 100);
      before.d30 += line.value / (1 + (changes?.d30 ?? 0) / 100);
    }
  }
  const since = (then: number) => (then > 0 ? (total / then - 1) * 100 : null);
  const priced = shown
    .filter(line => line.value !== null)
    .sort((a, b) => b.value! - a.value!);
  return {
    total,
    pnl,
    paid: spent,
    pnlPartial: pnlPartial && pnl !== null,
    change24h: since(before.h24),
    change7d: since(before.d7),
    change30d: since(before.d30),
    lines: priced.filter(line => line.value! >= threshold),
    dust: priced.filter(line => line.value! < threshold),
    unpriced: shown.filter(line => line.value === null),
    hidden: all.filter(line => hiddenKeys.has(line.key)),
    stale: shown.some(line => line.stale),
  };
}

/** Every price id the holdings need. */
export function coinIdsOf(holdings: Holding[]): string[] {
  // USDC is always asked: its price gives the value of a dollar. So is the
  // coin a staked or wrapped form stands for.
  const ids = holdings.map(h => h.coinId).filter((id): id is string => !!id);
  return [
    ...new Set([
      USDC_ID,
      ...ids,
      ...ids.map(id => FORM_OF.get(id)).filter((id): id is string => !!id),
    ]),
  ];
}
