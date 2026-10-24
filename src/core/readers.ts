/**
 * Balances of public addresses, read straight from public nodes. Nothing
 * here can spend: every call is a read that needs no key.
 */
import {
  BITCOIN_API,
  COSMOS_CHAINS,
  CosmosChain,
  FAMILY_NAMES,
  NEAR_POOLS,
  NEAR_RPC,
  TOKEN_CHAINS,
  TokenChain,
} from './chains';
import {firstOf, request, toQuantity} from './http';
import {
  fetchHlAccount,
  fetchHlMarket,
  HlAccount,
  hlIsEmpty,
  HlMarket,
  hlParts,
} from './hyperliquid';
import {Listed, mirrorsNative, priceIdOf, Token} from './tokens';
import {Wallet} from './wallets';

/** An amount of one coin, at one address, on one chain. */
export interface Holding {
  /** The read that produced it; see Source.key. */
  source: string;
  wallet: string;
  chain: string;
  symbol: string;
  name: string;
  quantity: number;
  coinId: string | null;
  /** 'staked' when the coins are delegated rather than free. */
  note?: string;
  /** Dollar price given by the chain itself, for a coin without a price id. */
  usd?: number | null;
  /** Dollars paid per coin, when the exchange holding it recorded it. */
  cost?: number | null;
  /** Kept from an earlier read because this one failed. */
  stale?: boolean;
}

/** Key of the Hyperliquid exchange among the reads. */
export const HYPERLIQUID = 'hyperliquid';

/** One read: an address on a chain. Fails or succeeds as a whole. */
export interface Source {
  key: string;
  label: string;
  read: () => Promise<Holding[]>;
}

type Rpc = {result?: unknown; error?: {message?: string}};

async function rpc(chain: TokenChain, calls: object[]): Promise<Rpc[]> {
  return firstOf(chain.rpc, async url => {
    const answer = await request(
      url,
      calls.map((call, id) => ({jsonrpc: '2.0', id, ...call})),
    );
    if (!Array.isArray(answer)) {
      throw new Error((answer as Rpc)?.error?.message ?? 'unexpected answer');
    }
    const byId: Rpc[] = [];
    for (const item of answer as (Rpc & {id: number})[]) {
      byId[item.id] = item;
    }
    return byId;
  });
}

const hexUnits = (result: unknown): bigint =>
  typeof result === 'string' && /^0x[0-9a-fA-F]+$/.test(result)
    ? BigInt(result)
    : 0n;

/** balanceOf(address), the one ERC-20 call made. */
const balanceOf = (address: string): string =>
  '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0');

/** What a node says when it could not serve a call, whatever the contract. */
const BUSY = /limit|too many|timeout|timed out|busy|capacity|unavailable|overload/i;

async function readEvm(
  chain: TokenChain,
  wallet: Wallet,
  tokens: Token[],
  base: Pick<Holding, 'source' | 'wallet' | 'chain'>,
): Promise<Holding[]> {
  const answers = await rpc(chain, [
    {method: 'eth_getBalance', params: [wallet.address, 'latest']},
    ...tokens.map(token => ({
      method: 'eth_call',
      params: [{to: token.address, data: balanceOf(wallet.address)}, 'latest'],
    })),
  ]);
  if (answers[0]?.result === undefined) {
    throw new Error(answers[0]?.error?.message ?? 'no balance returned');
  }
  const holdings: Holding[] = [
    {
      ...base,
      symbol: chain.native,
      name: chain.native,
      quantity: toQuantity(hexUnits(answers[0].result), 18),
      coinId: chain.nativeId,
    },
  ];
  tokens.forEach((token, i) => {
    // Counted once, as the coin of the chain.
    if (mirrorsNative(chain, token)) {
      return;
    }
    // A balance the node did not give is not a balance of zero: when it
    // skipped the question or was too busy, the read fails and the last
    // amounts are kept. A contract that answers with an error of its own
    // holds nothing for this address, and must not block the others.
    const answer = answers[i + 1];
    const refusal = answer?.error?.message ?? '';
    if (answer?.result === undefined && (refusal === '' || BUSY.test(refusal))) {
      throw new Error(refusal || `no balance returned for ${token.symbol}`);
    }
    holdings.push({
      ...base,
      symbol: token.symbol,
      name: token.name,
      quantity: toQuantity(hexUnits(answer?.result), token.decimals),
      coinId: priceIdOf(token),
    });
  });
  return holdings;
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SOLANA_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
];

/**
 * One question to the Solana node, asked alone: the public node refuses
 * grouped questions. Waits and asks again when it says it is busy.
 */
async function solana(chain: TokenChain, method: string, params: unknown[]): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await firstOf(chain.rpc, async url => {
        const answer = (await request(url, {jsonrpc: '2.0', id: 1, method, params})) as Rpc;
        if (answer?.error) {
          throw new Error(
            /too many/i.test(answer.error.message ?? '')
              ? 'rate limit reached, try again in a minute'
              : answer.error.message ?? 'unexpected answer',
          );
        }
        return answer?.result;
      });
    } catch (e) {
      if (attempt >= 2 || !/rate limit/.test((e as Error).message)) {
        throw e;
      }
      await pause(3000 * (attempt + 1));
    }
  }
}

/** Units held per token, every token account of the address added up. */
async function solanaUnits(
  chain: TokenChain,
  wallet: string,
): Promise<Map<string, {units: bigint; decimals: number}>> {
  const held = new Map<string, {units: bigint; decimals: number}>();
  for (const programId of SOLANA_PROGRAMS) {
    const result = await solana(chain, 'getTokenAccountsByOwner', [
      wallet,
      {programId},
      {encoding: 'jsonParsed'},
    ]);
    if (!Array.isArray(result?.value)) {
      throw new Error('no token balance');
    }
    for (const account of result.value) {
      const info = account?.account?.data?.parsed?.info;
      if (info?.mint && info.tokenAmount?.amount) {
        const before = held.get(info.mint)?.units ?? 0n;
        held.set(info.mint, {
          units: before + BigInt(info.tokenAmount.amount),
          decimals: Number(info.tokenAmount.decimals),
        });
      }
    }
  }
  return held;
}

async function readSolana(
  chain: TokenChain,
  wallet: Wallet,
  tokens: Token[],
  base: Pick<Holding, 'source' | 'wallet' | 'chain'>,
): Promise<Holding[]> {
  // Three questions whatever the number of followed tokens, one after the
  // other: the public node limits how many it takes at once.
  const lamports = (await solana(chain, 'getBalance', [wallet.address]))?.value;
  if (typeof lamports !== 'number') {
    throw new Error('no balance returned');
  }
  const held = tokens.length ? await solanaUnits(chain, wallet.address) : new Map();
  return [
    {
      ...base,
      symbol: chain.native,
      name: chain.native,
      quantity: lamports / 1e9,
      coinId: chain.nativeId,
    },
    ...tokens.map(token => ({
      ...base,
      symbol: token.symbol,
      name: token.name,
      quantity: toQuantity(held.get(token.address)?.units ?? 0n, token.decimals),
      coinId: priceIdOf(token),
    })),
  ];
}

async function readBitcoin(
  wallet: Wallet,
  base: Pick<Holding, 'source' | 'wallet' | 'chain'>,
): Promise<Holding[]> {
  const stats = await firstOf(BITCOIN_API, async api => {
    const raw = (await request(`${api}/address/${wallet.address}`)) as any;
    const s = raw?.chain_stats;
    if (typeof s?.funded_txo_sum !== 'number') {
      throw new Error('unexpected answer');
    }
    return s as {funded_txo_sum: number; spent_txo_sum: number};
  });
  return [
    {
      ...base,
      symbol: 'BTC',
      name: 'Bitcoin',
      // Confirmed coins only: received minus spent, in satoshis.
      quantity: (stats.funded_txo_sum - stats.spent_txo_sum) / 1e8,
      coinId: 'bitcoin',
    },
  ];
}

async function nearQuery(params: object): Promise<any> {
  return firstOf(NEAR_RPC, async url => {
    const answer = (await request(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {finality: 'final', ...params},
    })) as any;
    if (answer?.error) {
      throw new Error(
        String(answer.error.cause?.name ?? answer.error.message ?? 'error'),
      );
    }
    return answer?.result;
  });
}

/** JSON as base64, the form NEAR wants call arguments in. */
export function base64Json(value: object): string {
  const text = JSON.stringify(value);
  const table =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i);
    const b = text.charCodeAt(i + 1);
    const c = text.charCodeAt(i + 2);
    out +=
      table[a >> 2] +
      table[((a & 3) << 4) | (b >> 4 || 0)] +
      (isNaN(b) ? '=' : table[((b & 15) << 2) | (c >> 6 || 0)]) +
      (isNaN(c) ? '=' : table[c & 63]);
  }
  return out;
}

async function readNear(
  wallet: Wallet,
  base: Pick<Holding, 'source' | 'wallet' | 'chain'>,
): Promise<Holding[]> {
  const near = {symbol: 'NEAR', name: 'NEAR', coinId: 'near'};
  let amount = '0';
  try {
    const account = await nearQuery({
      request_type: 'view_account',
      account_id: wallet.address,
    });
    amount = String(account?.amount ?? '0');
  } catch (e) {
    // An account that never received anything does not exist yet.
    if (!/does not exist|UnknownAccount/i.test((e as Error).message)) {
      throw e;
    }
  }
  const holdings: Holding[] = [
    {...base, ...near, quantity: toQuantity(amount, 24)},
  ];
  // The pools written in the addresses file, plus those an index of the
  // chain knows of. Without the index, the written ones are still read.
  const pools = new Set(wallet.pools ?? []);
  try {
    const found = (await request(`${NEAR_POOLS}/${wallet.address}/staking`)) as any;
    for (const pool of Array.isArray(found?.pools) ? found.pools : []) {
      if (typeof pool?.pool_id === 'string') {
        pools.add(pool.pool_id);
      }
    }
  } catch {}
  for (const pool of pools) {
    const result = await nearQuery({
      request_type: 'call_function',
      account_id: pool,
      method_name: 'get_account_total_balance',
      args_base64: base64Json({account_id: wallet.address}),
    });
    // The answer is the bytes of a quoted number.
    const text = String.fromCharCode(...((result?.result as number[]) ?? []));
    holdings.push({
      ...base,
      ...near,
      quantity: toQuantity(text.replace(/"/g, '') || '0', 24),
      note: `staked in ${pool}`,
    });
  }
  return holdings;
}

async function readCosmos(
  chain: CosmosChain,
  wallet: Wallet,
  base: Pick<Holding, 'source' | 'wallet' | 'chain'>,
): Promise<Holding[]> {
  const [bank, staking] = await firstOf(chain.rest, rest =>
    Promise.all([
      request(
        `${rest}/cosmos/bank/v1beta1/balances/${wallet.address}?pagination.limit=200`,
      ),
      request(
        `${rest}/cosmos/staking/v1beta1/delegations/${wallet.address}?pagination.limit=200`,
      ),
    ]),
  );
  const holdings: Holding[] = [];
  for (const coin of ((bank as any)?.balances ?? []) as any[]) {
    const known = chain.denoms[coin?.denom];
    // A coin the plugin cannot name or price (an IBC voucher) is left out.
    if (known) {
      holdings.push({
        ...base,
        symbol: known[0],
        name: known[0],
        quantity: toQuantity(String(coin.amount), known[1]),
        coinId: known[2],
      });
    }
  }
  const stake = chain.denoms[chain.stakeDenom];
  let staked = 0n;
  for (const row of ((staking as any)?.delegation_responses ?? []) as any[]) {
    if (row?.balance?.denom === chain.stakeDenom) {
      staked += BigInt(row.balance.amount);
    }
  }
  if (staked > 0n) {
    holdings.push({
      ...base,
      symbol: stake[0],
      name: stake[0],
      quantity: toQuantity(staked, stake[1]),
      coinId: stake[2],
      note: 'staked',
    });
  }
  return holdings;
}

/**
 * Every read needed for these wallets: one per address and chain. An EVM
 * address is read on each chain that is switched on.
 */
export function sourcesFor(
  wallets: Wallet[],
  tokens: Record<string, Token[]>,
  skipped: string[],
  /** Receives each Hyperliquid account read, for the view that details it. */
  onHyperliquid?: (account: HlAccount) => void,
): Source[] {
  const sources: Source[] = [];
  // Names and prices are the same for every account: asked once per refresh.
  let market: Promise<HlMarket> | null = null;
  const add = (
    wallet: Wallet,
    chainKey: string,
    chainName: string,
    read: (base: Pick<Holding, 'source' | 'wallet' | 'chain'>) => Promise<Holding[]>,
  ) => {
    const key = `${chainKey}:${wallet.address}`;
    sources.push({
      key,
      label: `${chainName} ${wallet.name || wallet.address.slice(0, 8)}`,
      read: () => read({source: key, wallet: wallet.address, chain: chainName}),
    });
  };
  for (const wallet of wallets) {
    if (wallet.family === 'evm') {
      // A Hyperliquid account has the address of its EVM wallet.
      add(wallet, HYPERLIQUID, 'Hyperliquid', async base => {
        market = market ?? fetchHlMarket();
        const account = await fetchHlAccount(wallet.address, await market);
        onHyperliquid?.(account);
        return hlIsEmpty(account)
          ? []
          : hlParts(account).map(part => ({
              ...base,
              symbol: part.symbol,
              name: part.symbol,
              quantity: part.quantity,
              coinId: part.coinId,
              usd: part.usd,
              note: part.note,
              cost: part.cost ?? null,
            }));
      });
    }
    if (wallet.family === 'evm' || wallet.family === 'solana') {
      for (const chain of TOKEN_CHAINS) {
        if (chain.family === wallet.family && !skipped.includes(chain.key)) {
          const followed = tokens[chain.key] ?? [];
          add(wallet, chain.key, chain.name, base =>
            chain.family === 'evm'
              ? readEvm(chain, wallet, followed, base)
              : readSolana(chain, wallet, followed, base),
          );
        }
      }
    } else if (wallet.family === 'bitcoin') {
      add(wallet, 'bitcoin', 'Bitcoin', base => readBitcoin(wallet, base));
    } else if (wallet.family === 'near') {
      add(wallet, 'near', 'NEAR', base => readNear(wallet, base));
    } else {
      const chain = COSMOS_CHAINS.find(c => c.family === wallet.family)!;
      add(wallet, chain.family, FAMILY_NAMES[chain.family], base => readCosmos(chain, wallet, base));
    }
  }
  return sources;
}

export interface ReadResult {
  holdings: Holding[];
  /** Labels of the reads that failed, with the reason. */
  failed: string[];
  total: number;
}

/**
 * Runs every read at once. A read that fails keeps what it returned last
 * time, marked stale, so one silent node never empties the portfolio.
 */
export async function readAll(
  sources: Source[],
  previous: Holding[],
  onDone?: (done: number, total: number) => void,
): Promise<ReadResult> {
  const holdings: Holding[] = [];
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    sources.map(async source => {
      try {
        const read = await source.read();
        holdings.push(...read.filter(h => h.quantity > 0));
      } catch (e) {
        failed.push(`${source.label}: ${(e as Error).message}`);
        holdings.push(
          ...previous
            .filter(h => h.source === source.key)
            .map(h => ({...h, stale: true})),
        );
      }
      onDone?.(++done, sources.length);
    }),
  );
  return {holdings, failed, total: sources.length};
}

/** An ABI string answer: offset, length, then the bytes. */
function abiString(result: unknown): string {
  if (typeof result !== 'string' || result.length < 130) {
    return '';
  }
  const hex = result.slice(2);
  const length = Number(BigInt('0x' + hex.slice(64, 128)));
  let text = '';
  for (let i = 0; i < length && 128 + i * 2 + 2 <= hex.length; i++) {
    text += String.fromCharCode(parseInt(hex.slice(128 + i * 2, 130 + i * 2), 16));
  }
  return text.replace(/[^\x20-\x7e]/g, '');
}

/**
 * Symbol and decimals of a token that is in no list, asked from the token
 * itself. null when the address is not a token on this chain.
 */
export async function readTokenInfo(
  chain: TokenChain,
  address: string,
): Promise<{symbol: string; decimals: number} | null> {
  if (chain.family === 'evm') {
    const [decimals, symbol] = await rpc(chain, [
      {method: 'eth_call', params: [{to: address, data: '0x313ce567'}, 'latest']},
      {method: 'eth_call', params: [{to: address, data: '0x95d89b41'}, 'latest']},
    ]);
    if (typeof decimals?.result !== 'string' || decimals.result.length < 4) {
      return null;
    }
    return {
      symbol: abiString(symbol?.result).toUpperCase() || address.slice(0, 8),
      decimals: Number(hexUnits(decimals.result)),
    };
  }
  const found = (await solana(chain, 'getTokenSupply', [address]).catch(() => null))
    ?.value?.decimals;
  return typeof found === 'number'
    ? {symbol: address.slice(0, 5).toUpperCase(), decimals: found}
    : null;
}

/** The same contract on every EVM chain: many read calls answered as one. */
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
/** Tokens asked per call when searching a whole list. */
const SCAN_CHUNK = 400;

const word = (n: number): string => n.toString(16).padStart(64, '0');

/** aggregate3 over balanceOf(wallet) of each token, failures allowed. */
export function encodeBalances(tokens: string[], wallet: string): string {
  const n = tokens.length;
  let data = '82ad56cb' + word(32) + word(n);
  for (let i = 0; i < n; i++) {
    // Each entry is 192 bytes: target, allowFailure, offset, length, call.
    data += word(n * 32 + i * 192);
  }
  const call = balanceOf(wallet).slice(2).padEnd(128, '0');
  for (const token of tokens) {
    data +=
      token.slice(2).toLowerCase().padStart(64, '0') +
      word(1) +
      word(96) +
      word(36) +
      call;
  }
  return '0x' + data;
}

/** The balances out of an aggregate3 answer; 0 where the call failed. */
export function decodeBalances(result: string): bigint[] {
  const hex = result.slice(2);
  const at = (byte: number): number =>
    Number(BigInt('0x' + (hex.slice(byte * 2, byte * 2 + 64) || '0')));
  const start = at(0);
  const count = at(start);
  const base = start + 32;
  const balances: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const entry = base + at(base + i * 32);
    const ok = at(entry) === 1;
    const bytes = entry + at(entry + 32);
    const length = at(bytes);
    const value = hex.slice((bytes + 32) * 2, (bytes + 64) * 2);
    balances.push(ok && length >= 32 && value !== '' ? BigInt('0x' + value) : 0n);
  }
  return balances;
}

/**
 * The tokens of a list that an address holds. A chain cannot answer that
 * directly, so the whole list is asked, a few hundred tokens per call.
 */
export async function findHeld(
  chain: TokenChain,
  wallet: string,
  list: Listed[],
  onStep?: (done: number, total: number) => void,
): Promise<Listed[]> {
  if (chain.family === 'solana') {
    // Only what the list knows, as on the other chains: an address also
    // holds NFTs and tokens it never asked for, by the hundred.
    const known = new Map(list.map(token => [token[0], token]));
    const held: Listed[] = [];
    for (const [mint, {units}] of await solanaUnits(chain, wallet)) {
      const listed = known.get(mint);
      if (units > 0n && listed) {
        held.push(listed);
      }
    }
    return held;
  }
  const held: Listed[] = [];
  const steps = Math.ceil(list.length / SCAN_CHUNK);
  for (let step = 0; step < steps; step++) {
    const chunk = list.slice(step * SCAN_CHUNK, (step + 1) * SCAN_CHUNK);
    const [answer] = await rpc(chain, [
      {
        method: 'eth_call',
        params: [
          {to: MULTICALL, data: encodeBalances(chunk.map(t => t[0]), wallet)},
          'latest',
        ],
      },
    ]);
    if (typeof answer?.result !== 'string') {
      throw new Error(answer?.error?.message ?? 'no answer to the search');
    }
    decodeBalances(answer.result).forEach((balance, i) => {
      if (balance > 0n) {
        held.push(chunk[i]);
      }
    });
    onStep?.(step + 1, steps);
  }
  return held;
}
