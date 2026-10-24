/**
 * A Hyperliquid account, read from the public info endpoint: it takes an
 * address and returns its state, with no key and no signature.
 */
import {fmtNumber, thin} from './format';
import {request} from './http';
import {USDC_ID} from './tokens';

const INFO = 'https://api.hyperliquid.xyz/info';
export const HL_HOSTS = ['api.hyperliquid.xyz'];

const info = (body: object): Promise<any> => request(INFO, body);

const num = (v: unknown): number => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return isFinite(n) ? n : 0;
};

/** Price ids of the spot tokens the price source knows under another name. */
const COIN_IDS: Record<string, string> = {
  USDC: USDC_ID,
  HYPE: 'hyperliquid',
  UBTC: 'bitcoin',
  UETH: 'ethereum',
  USOL: 'solana',
  USDE: 'ethena-usde',
  USDT0: 'usdt0',
  USDH: 'usdh-2',
  PURR: 'purr-2',
  UPUMP: 'pump-fun',
};
const hlCoinId = (coin: string): string | null => COIN_IDS[coin] ?? null;
const STABLE = new Set(['USDC', 'USDT0', 'USDE', 'USDH']);

export interface HlPosition {
  coin: string;
  /** Signed: positive long, negative short. */
  size: number;
  leverage: number;
  isolated: boolean;
  entry: number;
  mark: number;
  value: number;
  pnl: number;
  /** Gain as a share of the margin, in percent. */
  roe: number;
  margin: number;
  /** Funding since the position was opened; positive = received. */
  funding: number;
  liquidation: number | null;
  /** How far the mark is from the liquidation price, in percent. */
  liquidationDistance: number | null;
  /** Current funding rate per hour, in percent; null when unknown. */
  fundingRate: number | null;
  /** What the position pays per day at that rate; negative = receives. */
  fundingPerDay: number | null;
}

export interface HlSpot {
  coin: string;
  total: number;
  /** Locked in open orders or as margin. */
  hold: number;
  price: number | null;
  value: number | null;
  /**
   * Value minus what it cost; null for a stablecoin, without a price, or
   * when the exchange has no entry value (deposited coins).
   */
  pnl: number | null;
  /** Dollars paid per coin, as the exchange recorded it; null if unknown. */
  cost?: number | null;
}

export interface HlOrder {
  coin: string;
  buy: boolean;
  size: number;
  price: number;
  type: string;
  trigger: number | null;
  reduceOnly: boolean;
}

export interface HlPeriod {
  pnl: number;
  volume: number;
  /** The same for the perp account alone. */
  perpPnl: number;
  perpVolume: number;
  /** Account value and PnL over the period, thinned for a chart. */
  values: number[];
  pnls: number[];
}

/** Points kept of a history: the chart has no more columns than that. */
const HISTORY_POINTS = 90;

/** [time, "value"] pairs thinned to at most HISTORY_POINTS averages. */
const thinned = (history: unknown): number[] =>
  thin(
    (Array.isArray(history) ? history : []).map(point => num(point?.[1])),
    HISTORY_POINTS,
  );

/** NEAR LONG 58.30 · 3x cross: a position in one line. */
export const positionTitle = (p: HlPosition, separator = '·'): string =>
  `${p.coin} ${p.size >= 0 ? 'LONG' : 'SHORT'} ${fmtNumber(Math.abs(p.size))} ${separator} ` +
  `${p.leverage}x ${p.isolated ? 'isolated' : 'cross'}`;

/** One executed trade, as the trade history of the exchange lists it. */
export interface HlFill {
  time: number;
  coin: string;
  /** Open Long, Close Short, Buy, Sell... in the words of the exchange. */
  direction: string;
  price: number;
  size: number;
  value: number;
  fee: number;
  feeCoin: string;
  closedPnl: number;
}

/**
 * The latest trades, newest first. Spot trades name their pair by a number:
 * `spotMeta` gives the coin behind it.
 */
export function parseHlFills(raw: unknown, spotMeta: any, count: number): HlFill[] {
  const tokens = new Map<number, string>(
    (spotMeta?.tokens ?? []).map((token: any) => [token.index, token.name]),
  );
  const pairs = new Map<string, string>(
    (spotMeta?.universe ?? []).map((pair: any) => [
      pair.name,
      tokens.get(pair.tokens?.[0]) ?? pair.name,
    ]),
  );
  return (Array.isArray(raw) ? raw : [])
    .map(fill => {
      const coin = String(fill.coin ?? '');
      const price = num(fill.px);
      const size = num(fill.sz);
      return {
        time: num(fill.time),
        coin: pairs.get(coin) ?? coin.split('/')[0],
        direction: String(fill.dir ?? (fill.side === 'B' ? 'Buy' : 'Sell')),
        price,
        size,
        value: price * size,
        fee: num(fill.fee),
        feeCoin: String(fill.feeToken ?? 'USDC'),
        closedPnl: num(fill.closedPnl),
      };
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, count);
}

/** Asked only when the user wants it: one more request per account. */
export async function fetchHlFills(address: string, count = 20): Promise<HlFill[]> {
  const [fills, spotMeta] = await Promise.all([
    info({type: 'userFills', user: address}),
    info({type: 'spotMeta'}).catch(() => null),
  ]);
  return parseHlFills(fills, spotMeta, count);
}

export interface HlAccount {
  address: string;
  at: number;
  /** Perp margin sits in the spot balance (unified, portfolio margin). */
  unified: boolean;
  /** The account value as Hyperliquid itself reports it; null if unknown. */
  accountValue: number | null;
  perps: {
    accountValue: number;
    marginUsed: number;
    withdrawable: number;
    notional: number;
    /** Notional over account value. */
    leverage: number | null;
    /** Maintenance margin over account value, in percent. */
    marginRatio: number | null;
  };
  positions: HlPosition[];
  spot: HlSpot[];
  staking: {
    delegated: number;
    undelegated: number;
    pending: number;
    total: number;
    price: number | null;
    value: number | null;
    rewards: number;
  };
  vaults: {address: string; equity: number}[];
  earn: {coin: string; supplied: number; borrowed: number}[];
  earnHealth: string;
  orders: HlOrder[];
  periods: Record<'day' | 'week' | 'month' | 'allTime', HlPeriod>;
  /** Kept from an earlier read because this one failed. */
  stale?: boolean;
}

/** What every account needs and no account owns: names and prices. */
export interface HlMarket {
  mids: Record<string, string>;
  /** Spot token name by index. */
  tokenNames: Map<number, string>;
  /** Key of the token's USDC pair in `mids`, by token index. */
  pairKeys: Map<number, string>;
  /** Mark price and hourly funding rate by perp coin. */
  perps: Map<string, {mark: number; funding: number}>;
  /** Names of the perp markets run by others than Hyperliquid (HIP-3). */
  dexes: string[];
}

/** Mark price and funding rate of each coin of a perp market. */
function perpPrices(answer: any, into: Map<string, {mark: number; funding: number}>) {
  (answer?.[0]?.universe ?? []).forEach((asset: any, i: number) => {
    const ctx = answer?.[1]?.[i];
    if (asset?.name && ctx) {
      into.set(asset.name, {mark: num(ctx.markPx), funding: num(ctx.funding)});
    }
  });
}

export async function fetchHlMarket(): Promise<HlMarket> {
  const [mids, spotMeta, perpMeta, perpDexs] = await Promise.all([
    info({type: 'allMids'}),
    info({type: 'spotMeta'}),
    info({type: 'metaAndAssetCtxs'}),
    info({type: 'perpDexs'}).catch(() => []),
  ]);
  const tokenNames = new Map<number, string>();
  for (const token of spotMeta?.tokens ?? []) {
    tokenNames.set(token.index, token.name);
  }
  const pairKeys = new Map<number, string>();
  for (const pair of spotMeta?.universe ?? []) {
    // Only a pair quoted in USDC (token 0) gives a dollar price.
    if (pair?.tokens?.[1] === 0 && !pairKeys.has(pair.tokens[0])) {
      pairKeys.set(pair.tokens[0], pair.name);
    }
  }
  const perps = new Map<string, {mark: number; funding: number}>();
  perpPrices(perpMeta, perps);
  const dexes = (Array.isArray(perpDexs) ? perpDexs : [])
    .map((dex: any) => dex?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name !== '');
  return {mids: mids ?? {}, tokenNames, pairKeys, perps, dexes};
}

/** Dollar price of a spot token: 1 for a stablecoin, else its USDC pair. */
export function spotPrice(market: HlMarket, coin: string, token: number): number | null {
  if (STABLE.has(coin)) {
    return 1;
  }
  const key = market.pairKeys.get(token);
  const mid = key ? num(market.mids[key]) : 0;
  return mid > 0 ? mid : null;
}

/** The last value of a history of [time, value] points. */
const last = (history: unknown): number | null => {
  const point = Array.isArray(history) ? history[history.length - 1] : null;
  return Array.isArray(point) ? num(point[1]) : null;
};

/** Builds the account from the raw answers; pure, so it can be tested. */
export function parseHlAccount(
  address: string,
  market: HlMarket,
  raw: {
    mode: unknown;
    perps: any;
    spot: any;
    staking: any;
    rewards: any;
    vaults: any;
    earn: any;
    orders: any;
    portfolio: any;
    /** The same answers for each HIP-3 market the account is on. */
    dexes?: {state: any; prices?: any; orders?: any}[];
  },
  at: number,
): HlAccount {
  // Hyperliquid's own market first, then the others; their coins are named
  // after their market (xyz:TSLA), so the lists can simply be joined.
  const states = [raw.perps, ...(raw.dexes ?? []).map(dex => dex.state)];
  const sum = (pick: (state: any) => unknown): number =>
    states.reduce((total: number, state) => total + num(pick(state)), 0);
  const perpValue = sum(state => state?.marginSummary?.accountValue);
  const notional = sum(state => state?.marginSummary?.totalNtlPos);
  const prices = new Map(market.perps);
  for (const dex of raw.dexes ?? []) {
    perpPrices(dex.prices, prices);
  }

  const positions: HlPosition[] = states
    .flatMap(state => state?.assetPositions ?? [])
    .map((entry: any): HlPosition => {
      const p = entry?.position ?? {};
      const size = num(p.szi);
      const value = num(p.positionValue);
      const ctx = prices.get(p.coin);
      const mark = ctx?.mark || (size !== 0 ? value / Math.abs(size) : 0);
      const liquidation = p.liquidationPx == null ? null : num(p.liquidationPx);
      const rate = ctx ? ctx.funding : null;
      return {
        coin: String(p.coin),
        size,
        leverage: num(p.leverage?.value),
        isolated: p.leverage?.type === 'isolated',
        entry: num(p.entryPx),
        mark,
        value,
        pnl: num(p.unrealizedPnl),
        roe: num(p.returnOnEquity) * 100,
        margin: num(p.marginUsed),
        // The API counts funding paid as positive.
        funding: -num(p.cumFunding?.sinceOpen),
        liquidation,
        liquidationDistance:
          liquidation !== null && mark > 0
            ? (Math.abs(mark - liquidation) / mark) * 100
            : null,
        fundingRate: rate === null ? null : rate * 100,
        // A long pays when the rate is positive, a short receives.
        fundingPerDay: rate === null ? null : value * rate * 24 * Math.sign(size),
      };
    });
  // The position closest to its liquidation comes first.
  positions.sort(
    (a, b) =>
      (a.liquidationDistance ?? Infinity) - (b.liquidationDistance ?? Infinity),
  );

  const spot: HlSpot[] = (raw.spot?.balances ?? [])
    .map((b: any): HlSpot => {
      const total = num(b.total);
      const coin = market.tokenNames.get(b.token) ?? String(b.coin);
      const price = spotPrice(market, coin, b.token);
      const value = price === null ? null : total * price;
      // No entry value: the coins were deposited, what they cost is unknown.
      const entry = STABLE.has(coin) || total <= 0 ? 0 : num(b.entryNtl);
      return {
        coin,
        total,
        hold: num(b.hold),
        price,
        value,
        pnl: value === null || entry <= 0 ? null : value - entry,
        cost: entry <= 0 ? null : entry / total,
      };
    })
    .filter((b: HlSpot) => b.total > 0)
    .sort((a: HlSpot, b: HlSpot) => (b.value ?? 0) - (a.value ?? 0));

  const delegated = num(raw.staking?.delegated);
  const undelegated = num(raw.staking?.undelegated);
  const pending = num(raw.staking?.totalPendingWithdrawal);
  const staked = delegated + undelegated + pending;
  const hypePrice = num(market.mids.HYPE) || market.perps.get('HYPE')?.mark || null;

  const periods = {} as HlAccount['periods'];
  let accountValue: number | null = null;
  const byName = new Map<string, any>(Array.isArray(raw.portfolio) ? raw.portfolio : []);
  for (const name of ['day', 'week', 'month', 'allTime'] as const) {
    const period = byName.get(name);
    // perpDay, perpWeek...: the same periods for the perp account alone.
    const perp = byName.get(`perp${name[0].toUpperCase()}${name.slice(1)}`);
    periods[name] = {
      pnl: last(period?.pnlHistory) ?? 0,
      volume: num(period?.vlm),
      perpPnl: last(perp?.pnlHistory) ?? 0,
      perpVolume: num(perp?.vlm),
      values: thinned(period?.accountValueHistory),
      pnls: thinned(period?.pnlHistory),
    };
    accountValue = accountValue ?? last(period?.accountValueHistory);
  }

  const mode = typeof raw.mode === 'string' ? raw.mode : '';
  return {
    address,
    at,
    unified: mode === 'unifiedAccount' || mode === 'portfolioMargin',
    accountValue,
    perps: {
      accountValue: perpValue,
      marginUsed: sum(state => state?.marginSummary?.totalMarginUsed),
      withdrawable: sum(state => state?.withdrawable),
      notional,
      leverage: perpValue > 0 ? notional / perpValue : null,
      marginRatio:
        perpValue > 0
          ? (sum(state => state?.crossMaintenanceMarginUsed) / perpValue) * 100
          : null,
    },
    positions,
    spot,
    staking: {
      delegated,
      undelegated,
      pending,
      total: staked,
      price: hypePrice,
      value: hypePrice === null ? null : staked * hypePrice,
      rewards: (Array.isArray(raw.rewards) ? raw.rewards : []).reduce(
        (sum: number, r: any) => sum + num(r?.totalAmount),
        0,
      ),
    },
    vaults: (Array.isArray(raw.vaults) ? raw.vaults : [])
      .map((v: any) => ({address: String(v.vaultAddress), equity: num(v.equity)}))
      .filter((v: {equity: number}) => v.equity >= 0.01),
    earn: (raw.earn?.tokenToState ?? [])
      .map(([token, state]: [number, any]) => ({
        coin: market.tokenNames.get(token) ?? `#${token}`,
        supplied: num(state?.supply?.value),
        borrowed: num(state?.borrow?.value),
      }))
      .filter((e: {supplied: number; borrowed: number}) => e.supplied > 0 || e.borrowed > 0),
    earnHealth: String(raw.earn?.health ?? ''),
    orders: [raw.orders, ...(raw.dexes ?? []).map(dex => dex.orders)]
      .flatMap(orders => (Array.isArray(orders) ? orders : []))
      .map(
      (o: any): HlOrder => ({
        coin: String(o.coin),
        buy: o.side === 'B',
        size: num(o.sz),
        price: num(o.limitPx),
        type: String(o.orderType ?? ''),
        trigger: o.isTrigger || num(o.triggerPx) > 0 ? num(o.triggerPx) : null,
        reduceOnly: !!o.reduceOnly,
      }),
      ),
    periods,
  };
}

export async function fetchHlAccount(
  address: string,
  market: HlMarket,
): Promise<HlAccount> {
  const ask = (type: string) => info({type, user: address});
  const [mode, perps, spot, staking, rewards, vaults, earn, orders, portfolio] =
    await Promise.all([
      ask('userAbstraction').catch(() => ''),
      ask('clearinghouseState'),
      ask('spotClearinghouseState'),
      ask('delegatorSummary'),
      ask('delegatorRewards').catch(() => []),
      ask('userVaultEquities').catch(() => []),
      ask('borrowLendUserState').catch(() => null),
      ask('frontendOpenOrders').catch(() => []),
      ask('portfolio').catch(() => []),
    ]);
  // Every HIP-3 market is asked for the account; prices and orders only
  // where it has something.
  const dexes = (
    await Promise.all(
      market.dexes.map(async dex => {
        const state = await info({type: 'clearinghouseState', user: address, dex}).catch(
          () => null,
        );
        if (
          !state ||
          ((state.assetPositions ?? []).length === 0 &&
            num(state.marginSummary?.accountValue) < 0.01)
        ) {
          return null;
        }
        const [prices, dexOrders] = await Promise.all([
          info({type: 'metaAndAssetCtxs', dex}).catch(() => null),
          info({type: 'frontendOpenOrders', user: address, dex}).catch(() => []),
        ]);
        return {state, prices, orders: dexOrders};
      }),
    )
  ).filter(<T>(dex: T | null): dex is T => dex !== null);
  return parseHlAccount(
    address,
    market,
    {mode, perps, spot, staking, rewards, vaults, earn, orders, portfolio, dexes},
    Date.now(),
  );
}

/** Whether there is anything to show for this address. */
export const hlIsEmpty = (a: HlAccount): boolean =>
  (a.accountValue ?? 0) < 0.01 &&
  a.perps.accountValue < 0.01 &&
  a.positions.length === 0 &&
  a.spot.length === 0 &&
  a.staking.total === 0 &&
  a.vaults.length === 0;

/**
 * The accounts to keep after a read: one that could not be read keeps its
 * last figures, marked; an empty one is dropped.
 */
export function mergeHlAccounts(
  addresses: string[],
  read: Record<string, HlAccount>,
  before: Record<string, HlAccount>,
): Record<string, HlAccount> {
  const accounts: Record<string, HlAccount> = {};
  for (const address of addresses) {
    const kept = before[address];
    const account = read[address] ?? (kept ? {...kept, stale: true} : null);
    if (account && !hlIsEmpty(account)) {
      accounts[address] = account;
    }
  }
  return accounts;
}

/** One amount of the account, as the portfolio counts it. */
export interface HlPart {
  symbol: string;
  quantity: number;
  coinId: string | null;
  /** Dollar price from Hyperliquid, used when the price source has none. */
  usd: number | null;
  note?: string;
  /** Dollars paid per coin, when the exchange knows. */
  cost?: number | null;
}

/**
 * The account as amounts of coins. On a unified account the perp margin is
 * already inside the spot USDC, so the perp account is not added again.
 */
export function hlParts(account: HlAccount): HlPart[] {
  const parts: HlPart[] = account.spot.map(b => ({
    symbol: b.coin,
    quantity: b.total,
    coinId: hlCoinId(b.coin),
    usd: b.price,
    note: 'spot',
    cost: b.cost ?? null,
  }));
  if (!account.unified && account.perps.accountValue > 0) {
    parts.push({
      symbol: 'USDC',
      quantity: account.perps.accountValue,
      coinId: USDC_ID,
      usd: 1,
      note: 'perp account',
    });
  }
  if (account.staking.total > 0) {
    parts.push({
      symbol: 'HYPE',
      quantity: account.staking.total,
      coinId: 'hyperliquid',
      usd: account.staking.price,
      note: 'staked',
    });
  }
  for (const vault of account.vaults) {
    parts.push({
      symbol: 'USDC',
      quantity: vault.equity,
      coinId: USDC_ID,
      usd: 1,
      note: 'vault',
    });
  }
  return parts;
}
