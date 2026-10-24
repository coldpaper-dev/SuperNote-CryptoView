/**
 * Tokens of a chain. A chain cannot say which tokens an address holds, so
 * the user picks the ones to read from a list downloaded on demand.
 */
import {TOKEN_CHAINS, TokenChain} from './chains';
import {request} from './http';

/** A token the user chose to follow on one chain. */
export interface Token {
  /** Contract address (EVM, lower case) or mint (Solana). */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Price id; null while unknown. */
  coinId: string | null;
  /**
   * The price source was asked and does not know this contract. Without it,
   * a null price id only means the question failed, and is asked again.
   */
  noPrice?: boolean;
}

/** USDC under its various names: always counted as one US dollar. */
const USDC_NAMES = new Set(['USDC', 'USDC.E', 'USDBC', 'USDC.N']);
export const USDC_ID = 'usd-coin';
/** USDC and its bridged forms on the chains read, as the price source names them. */
const USDC_IDS = new Set([
  USDC_ID,
  'usd-coin-ethereum-bridged',
  'usd-coin-avalanche-bridged-usdc-e',
  'bridged-usdc-polygon-pos-bridge',
  'bridged-usd-coin-optimism',
  'bridged-usd-coin-base',
  'binance-bridged-usdc-bnb-smart-chain',
]);

/**
 * The price id used for a token. USDC and its bridged forms all count as
 * USDC, but only when the price source itself lists the contract as one:
 * anybody can issue a token and call it USDC.
 */
export const priceIdOf = (token: {symbol: string; coinId: string | null}): string | null =>
  token.coinId !== null &&
  USDC_NAMES.has(token.symbol.toUpperCase()) &&
  USDC_IDS.has(token.coinId)
    ? USDC_ID
    : token.coinId;

/**
 * Some chains show their own coin as a token too (POL on Polygon): such a
 * token has the price id of the chain's coin, and is never counted with it.
 */
export const mirrorsNative = (
  chain: TokenChain,
  token: {symbol: string; coinId: string | null},
): boolean => priceIdOf(token) === chain.nativeId;

/** One entry of a downloaded list: address, symbol, name, decimals. */
export type Listed = [string, string, string, number];

export interface TokenList {
  at: number;
  tokens: Listed[];
}

export const TOKEN_HOSTS = ['tokens.coingecko.com'];

const LIST_TIMEOUT_MS = 40000;

export const tokenAddress = (chain: TokenChain, address: string): string =>
  chain.family === 'evm' ? address.trim().toLowerCase() : address.trim();

function parseTokenList(chain: TokenChain, raw: unknown): Listed[] {
  const rows = (raw as {tokens?: unknown[]} | null)?.tokens;
  const listed: Listed[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const r = row as Record<string, unknown>;
    if (
      typeof r.address === 'string' &&
      typeof r.symbol === 'string' &&
      typeof r.decimals === 'number'
    ) {
      listed.push([
        tokenAddress(chain, r.address),
        r.symbol.toUpperCase(),
        typeof r.name === 'string' ? r.name : r.symbol,
        r.decimals,
      ]);
    }
  }
  return listed;
}

export async function fetchTokenList(chain: TokenChain): Promise<Listed[]> {
  const raw = await request(
    `https://tokens.coingecko.com/${chain.platform}/all.json`,
    undefined,
    LIST_TIMEOUT_MS,
  );
  return parseTokenList(chain, raw);
}

/** Tokens matching what was typed: exact symbol, symbol prefix, then name. */
export function searchTokens(list: Listed[], typed: string, limit: number): Listed[] {
  const q = typed.trim().toLowerCase();
  if (q === '') {
    return [];
  }
  const groups: Listed[][] = [[], [], [], []];
  for (const token of list) {
    const symbol = token[1].toLowerCase();
    const name = token[2].toLowerCase();
    if (token[0].toLowerCase() === q || symbol === q) {
      groups[0].push(token);
    } else if (symbol.startsWith(q)) {
      groups[1].push(token);
    } else if (name.startsWith(q)) {
      groups[2].push(token);
    } else if (name.includes(q)) {
      groups[3].push(token);
    }
  }
  return groups.flat().slice(0, limit);
}

/** Key of a contract in the table of price ids. */
const contractKey = (platform: string, address: string): string =>
  `${platform}:${platform === 'solana' ? address : address.toLowerCase()}`;

/** The price id of every contract the price source knows, in one answer. */
export function parseContractIds(raw: unknown): Map<string, string> {
  const ids = new Map<string, string>();
  for (const coin of Array.isArray(raw) ? raw : []) {
    const platforms = coin?.platforms;
    if (typeof coin?.id !== 'string' || !platforms || typeof platforms !== 'object') {
      continue;
    }
    for (const platform of Object.keys(platforms)) {
      if (typeof platforms[platform] === 'string' && platforms[platform] !== '') {
        ids.set(contractKey(platform, platforms[platform]), coin.id);
      }
    }
  }
  return ids;
}

/**
 * One request for the whole table, rather than one per token: the price
 * source allows few requests a minute.
 */
export async function fetchContractIds(): Promise<Map<string, string>> {
  return parseContractIds(
    await request(
      'https://api.coingecko.com/api/v3/coins/list?include_platform=true',
      undefined,
      LIST_TIMEOUT_MS,
    ),
  );
}

/** A token with its price id filled in from the table; absent = no price. */
export function withPriceId<T extends {address: string}>(
  chain: TokenChain,
  token: T,
  ids: Map<string, string>,
): T & Pick<Token, 'coinId' | 'noPrice'> {
  const coinId = ids.get(contractKey(chain.platform, token.address)) ?? null;
  const rest = {...token} as T & {noPrice?: boolean};
  delete rest.noPrice;
  return {...(rest as T), coinId, ...(coinId ? {} : {noPrice: true})};
}

/**
 * Every followed token with its price id filled in from the table. Tokens
 * the table did not know last time are asked again only with `again`.
 */
export function fillPriceIds(
  tokens: Record<string, Token[]>,
  ids: Map<string, string>,
  again: boolean,
): Record<string, Token[]> {
  const filled = {...tokens};
  for (const chain of TOKEN_CHAINS) {
    filled[chain.key] = (tokens[chain.key] ?? []).map(token =>
      token.coinId || (token.noPrice && !again) ? token : withPriceId(chain, token, ids),
    );
  }
  return filled;
}

/** The price id of a contract, or null when the price source has none. */
export async function fetchCoinId(
  chain: TokenChain,
  address: string,
): Promise<string | null> {
  try {
    const raw = (await request(
      `https://api.coingecko.com/api/v3/coins/${chain.platform}/contract/${address}`,
    )) as {id?: unknown} | null;
    return typeof raw?.id === 'string' ? raw.id : null;
  } catch (e) {
    if (/answered 404/.test((e as Error).message)) {
      return null;
    }
    throw e;
  }
}
