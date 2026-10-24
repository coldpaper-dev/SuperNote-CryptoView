/**
 * What CryptoView keeps: the settings, the last quotes read and the list of
 * coins the search offers.
 */
import {ManualAccount, normalizeManual} from './manual';
import {Holding} from './readers';
import {Token} from './tokens';

export type Currency = 'eur' | 'usd';

/** One entry of the search list. */
export interface Coin {
  id: string;
  symbol: string;
  name: string;
  rank: number;
}

/** Percentage changes of the price; null when the source has none. */
export interface Changes {
  h1: number | null;
  h24: number | null;
  d7: number | null;
  d14: number | null;
  d30: number | null;
  d200: number | null;
  y1: number | null;
}

export interface Quote extends Coin {
  price: number;
  high24h: number | null;
  low24h: number | null;
  marketCap: number | null;
  /** All-time high, and how far the price is from it, in percent. */
  ath: number | null;
  athChange: number | null;
  /** The fields below are absent from quotes stored by an earlier version. */
  athDate?: string | null;
  atl?: number | null;
  atlChange?: number | null;
  atlDate?: string | null;
  volume?: number | null;
  circulating?: number | null;
  maxSupply?: number | null;
  /** Value of every coin that will ever exist, at today's price. */
  fdv?: number | null;
  changes: Changes;
}

export interface Settings {
  currency: Currency;
  /** Coin ids, in the order shown. */
  favorites: string[];
  /** Tokens followed on each chain, by chain key. */
  tokens: Record<string, Token[]>;
  /** Keys of the chains that are not read. */
  skipped: string[];
  /** A coin worth less than this, in the display currency, is dust. */
  dust: number;
  /** Portfolio lines the user hid: spam tokens and the like. */
  hidden: string[];
  /** What the user paid per coin, by holding; see costKey. */
  costs: Record<string, Cost>;
  /**
   * Coins held that were already made favorites once: one the user then
   * removes from the favorites does not come back.
   */
  offered: string[];
  /** Columns picked for each table, by table; absent = the usual ones. */
  columns: Record<string, string[]>;
  /** Holdings typed by the user, by account. */
  manual: ManualAccount[];
  /** Coins offered by the converter, beside euro and dollar. */
  converter: string[];
}

/** A price paid for one coin, in the currency it was typed in. */
export interface Cost {
  price: number;
  currency: Currency;
}

export const DUST_CHOICES = [0, 1, 5, 10, 50, 100];

/** The last balances read. */
export interface Balances {
  at: number;
  holdings: Holding[];
  failed: string[];
  sources: number;
}

export const EMPTY_BALANCES: Balances = {
  at: 0,
  holdings: [],
  failed: [],
  sources: 0,
};

export interface QuoteCache {
  currency: Currency;
  /** When the quotes were read, ms since the epoch; 0 = never. */
  at: number;
  quotes: Record<string, Quote>;
  /** Euros for one US dollar when last known; converts a price paid. */
  usdEur?: number | null;
}

export interface CoinList {
  at: number;
  coins: Coin[];
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'eur',
  favorites: [
    'bitcoin',
    'ethereum',
    'solana',
    'hyperliquid',
    'near',
    'injective-protocol',
    'fetch-ai',
  ],
  tokens: {},
  skipped: [],
  dust: 1,
  hidden: [],
  costs: {},
  offered: [],
  columns: {},
  manual: [],
  converter: ['bitcoin', 'ethereum'],
};

export const EMPTY_CACHE: QuoteCache = {currency: 'eur', at: 0, quotes: {}};
export const EMPTY_LIST: CoinList = {at: 0, coins: []};

/** A stored value may be missing fields or come from another version. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  return {
    currency: r.currency === 'usd' ? 'usd' : 'eur',
    favorites: Array.isArray(r.favorites)
      ? r.favorites.filter(
          (id, i, all) => typeof id === 'string' && all.indexOf(id) === i,
        )
      : DEFAULT_SETTINGS.favorites,
    tokens:
      r.tokens && typeof r.tokens === 'object' && !Array.isArray(r.tokens)
        ? r.tokens
        : {},
    skipped: Array.isArray(r.skipped)
      ? r.skipped.filter(key => typeof key === 'string')
      : [],
    dust: DUST_CHOICES.includes(r.dust as number) ? (r.dust as number) : 1,
    hidden: Array.isArray(r.hidden)
      ? r.hidden.filter(key => typeof key === 'string')
      : [],
    costs:
      r.costs && typeof r.costs === 'object' && !Array.isArray(r.costs) ? r.costs : {},
    offered: Array.isArray(r.offered)
      ? r.offered.filter(id => typeof id === 'string')
      : [],
    columns:
      r.columns && typeof r.columns === 'object' && !Array.isArray(r.columns)
        ? Object.fromEntries(
            Object.entries(r.columns).filter(([, keys]) => Array.isArray(keys)),
          )
        : {},
    manual: normalizeManual(r.manual),
    converter: Array.isArray(r.converter)
      ? r.converter.filter(
          (id, i, all) => typeof id === 'string' && all.indexOf(id) === i,
        )
      : DEFAULT_SETTINGS.converter,
  };
}
