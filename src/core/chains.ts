/**
 * The networks CryptoView reads, the public servers it asks, and how each
 * native coin is priced.
 */

/** A kind of address. One EVM address is valid on every EVM chain. */
export type Family =
  | 'evm'
  | 'bitcoin'
  | 'solana'
  | 'near'
  | 'injective'
  | 'fetch'
  | 'cosmos'
  | 'osmosis';

export const FAMILY_NAMES: Record<Family, string> = {
  evm: 'EVM',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  near: 'NEAR',
  injective: 'Injective',
  fetch: 'Fetch.ai',
  cosmos: 'Cosmos Hub',
  osmosis: 'Osmosis',
};

export const FAMILIES = Object.keys(FAMILY_NAMES) as Family[];

/** A chain whose tokens the user picks from a downloaded list. */
export interface TokenChain {
  key: string;
  name: string;
  family: 'evm' | 'solana';
  /** Name of the chain in the token lists and the price source. */
  platform: string;
  rpc: readonly string[];
  native: string;
  /** Price id of the native coin. */
  nativeId: string;
}

export const TOKEN_CHAINS: readonly TokenChain[] = [
  {
    key: 'ethereum',
    name: 'Ethereum',
    family: 'evm',
    platform: 'ethereum',
    rpc: ['https://ethereum-rpc.publicnode.com'],
    native: 'ETH',
    nativeId: 'ethereum',
  },
  {
    key: 'arbitrum',
    name: 'Arbitrum',
    family: 'evm',
    platform: 'arbitrum-one',
    rpc: ['https://arbitrum-one-rpc.publicnode.com'],
    native: 'ETH',
    nativeId: 'ethereum',
  },
  {
    key: 'base',
    name: 'Base',
    family: 'evm',
    platform: 'base',
    rpc: ['https://base-rpc.publicnode.com'],
    native: 'ETH',
    nativeId: 'ethereum',
  },
  {
    key: 'optimism',
    name: 'Optimism',
    family: 'evm',
    platform: 'optimistic-ethereum',
    rpc: ['https://optimism-rpc.publicnode.com'],
    native: 'ETH',
    nativeId: 'ethereum',
  },
  {
    key: 'polygon',
    name: 'Polygon',
    family: 'evm',
    platform: 'polygon-pos',
    rpc: ['https://polygon-bor-rpc.publicnode.com'],
    native: 'POL',
    nativeId: 'polygon-ecosystem-token',
  },
  {
    key: 'avalanche',
    name: 'Avalanche',
    family: 'evm',
    platform: 'avalanche',
    rpc: ['https://avalanche-c-chain-rpc.publicnode.com'],
    native: 'AVAX',
    nativeId: 'avalanche-2',
  },
  {
    key: 'bnb',
    name: 'BNB Chain',
    family: 'evm',
    platform: 'binance-smart-chain',
    rpc: ['https://bsc-rpc.publicnode.com'],
    native: 'BNB',
    nativeId: 'binancecoin',
  },
  {
    key: 'hyperevm',
    name: 'HyperEVM',
    family: 'evm',
    platform: 'hyperevm',
    rpc: ['https://rpc.hyperliquid.xyz/evm'],
    native: 'HYPE',
    nativeId: 'hyperliquid',
  },
  {
    key: 'solana',
    name: 'Solana',
    family: 'solana',
    platform: 'solana',
    rpc: ['https://api.mainnet-beta.solana.com'],
    native: 'SOL',
    nativeId: 'solana',
  },
];

export const tokenChain = (key: string): TokenChain | undefined =>
  TOKEN_CHAINS.find(chain => chain.key === key);

export const BITCOIN_API = ['https://blockstream.info/api', 'https://mempool.space/api'];
export const NEAR_RPC = ['https://rpc.mainnet.near.org'];
/** Says in which staking pools an account has coins; a chain cannot. */
export const NEAR_POOLS = 'https://api.fastnear.com/v1/account';

/** A chain read through the Cosmos REST interface. */
export interface CosmosChain {
  family: 'injective' | 'fetch' | 'cosmos' | 'osmosis';
  prefix: string;
  rest: readonly string[];
  /** Base unit of the staking coin. */
  stakeDenom: string;
  /** Known coins by base unit: symbol, decimals, price id. */
  denoms: Record<string, readonly [string, number, string]>;
}

export const COSMOS_CHAINS: readonly CosmosChain[] = [
  {
    family: 'injective',
    prefix: 'inj',
    rest: ['https://injective-rest.publicnode.com', 'https://lcd.injective.network'],
    stakeDenom: 'inj',
    denoms: {
      inj: ['INJ', 18, 'injective-protocol'],
      peggy0xdAC17F958D2ee523a2206206994597C13D831ec7: ['USDT', 6, 'tether'],
      peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48: ['USDC', 6, 'usd-coin'],
    },
  },
  {
    family: 'fetch',
    prefix: 'fetch',
    rest: ['https://rest-fetchhub.fetch.ai', 'https://fetch-rest.publicnode.com'],
    stakeDenom: 'afet',
    denoms: {afet: ['FET', 18, 'fetch-ai']},
  },
  {
    family: 'cosmos',
    prefix: 'cosmos',
    rest: ['https://cosmos-rest.publicnode.com'],
    stakeDenom: 'uatom',
    denoms: {uatom: ['ATOM', 6, 'cosmos']},
  },
  {
    family: 'osmosis',
    prefix: 'osmo',
    rest: ['https://osmosis-rest.publicnode.com', 'https://lcd.osmosis.zone'],
    stakeDenom: 'uosmo',
    denoms: {uosmo: ['OSMO', 6, 'osmosis']},
  },
];

/** Every server the balance readers may contact, for the About text. */
export function balanceHosts(): string[] {
  const urls = [
    ...TOKEN_CHAINS.flatMap(chain => chain.rpc),
    ...BITCOIN_API,
    ...NEAR_RPC,
    NEAR_POOLS,
    ...COSMOS_CHAINS.flatMap(chain => chain.rest),
  ];
  return urls.map(url => url.replace(/^https:\/\//, '').split('/')[0]);
}

/** Every chain the plugin reads, by the name its holdings carry. */
export const CHAIN_NAMES: readonly string[] = [
  ...TOKEN_CHAINS.filter(chain => chain.family === 'evm').map(c => c.name),
  'Hyperliquid',
  'Solana',
  'Bitcoin',
  'NEAR',
  ...COSMOS_CHAINS.map(chain => FAMILY_NAMES[chain.family]),
];
