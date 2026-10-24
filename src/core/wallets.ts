/**
 * Public addresses: recognising what chain one belongs to, and reading the
 * text file that lists them.
 */
import {FAMILIES, Family} from './chains';

export interface Wallet {
  family: Family;
  address: string;
  name: string;
  /** NEAR only: staking pool contracts to ask. */
  pools?: string[];
}

const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
const SHAPES: [Family, RegExp][] = [
  ['evm', /^0x[0-9a-fA-F]{40}$/],
  ['bitcoin', new RegExp(`^(bc1[a-z0-9]{20,80}|[13]${BASE58}{25,34})$`)],
  ['injective', /^inj1[0-9a-z]{38,58}$/],
  ['fetch', /^fetch1[0-9a-z]{38,58}$/],
  ['cosmos', /^cosmos1[0-9a-z]{38,58}$/],
  ['osmosis', /^osmo1[0-9a-z]{38,58}$/],
  ['near', /^([0-9a-f]{64}|[a-z0-9_-]+(\.[a-z0-9_-]+)*\.(near|tg))$/],
  ['solana', new RegExp(`^${BASE58}{32,44}$`)],
];

/** Any NEAR account: named so only when the chain is given with it. */
const NEAR_ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([._-][a-z0-9]+)*$/;

/** True when the address can be one of this chain. */
export const fitsFamily = (address: string, family: Family): boolean =>
  familiesOf(address).includes(family) ||
  (family === 'near' && NEAR_ACCOUNT.test(address));

/**
 * The chains an address can belong to. Usually one; a short address starting
 * with 1 or 3 can be Bitcoin or Solana, and then the chain must be given.
 */
export function familiesOf(address: string): Family[] {
  return SHAPES.filter(([, shape]) => shape.test(address)).map(
    ([family]) => family,
  );
}

/** What looks like a secret must never be typed here. */
export function looksSecret(text: string): boolean {
  const t = text.trim();
  return (
    // An extended private key, a WIF key, a raw 32-byte key, a seed phrase.
    /^(xprv|yprv|zprv|tprv)/.test(t) ||
    /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(t) ||
    /^0x[0-9a-fA-F]{64}$/.test(t) ||
    /^([a-z]+\s+){11,}[a-z]+$/.test(t)
  );
}

const ALIASES: Record<string, Family> = {
  evm: 'evm',
  eth: 'evm',
  ethereum: 'evm',
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  sol: 'solana',
  solana: 'solana',
  near: 'near',
  inj: 'injective',
  injective: 'injective',
  fet: 'fetch',
  fetch: 'fetch',
  atom: 'cosmos',
  cosmos: 'cosmos',
  osmo: 'osmosis',
  osmosis: 'osmosis',
};

export const walletKey = (w: {family: Family; address: string}): string =>
  `${w.family}:${w.family === 'evm' ? w.address.toLowerCase() : w.address}`;

/** The name given to an address, or the address shortened. */
export const nameOf = (names: Record<string, string>, address: string): string =>
  names[address] || shortAddress(address);

export interface Parsed {
  wallets: Wallet[];
  /** Lines that could not be used, with the reason. */
  problems: string[];
}

/**
 * One address per line: `chain, address, name, pools` where the chain may be
 * left out when the address says it, the name is free, and pools (NEAR) are
 * separated by spaces. Lines starting with # are comments.
 */
export function parseWallets(text: string): Parsed {
  const wallets: Wallet[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      return;
    }
    const where = `line ${index + 1}`;
    if (looksSecret(line)) {
      problems.push(`${where}: looks like a secret, ignored`);
      return;
    }
    const parts = line.split(/[,;\t]/).map(part => part.trim());
    const named = ALIASES[parts[0].toLowerCase()];
    if (named) {
      parts.shift();
    }
    const address = parts[0] ?? '';
    const possible = familiesOf(address);
    const family = named ?? (possible.length === 1 ? possible[0] : undefined);
    if (!family || !fitsFamily(address, family)) {
      problems.push(
        possible.length > 1
          ? `${where}: could be ${possible.join(' or ')}, name the chain first`
          : `${where}: not a ${named ?? 'known'} address`,
      );
      return;
    }
    const wallet: Wallet = {family, address, name: parts[1] ?? ''};
    if (family === 'near' && parts[2]) {
      wallet.pools = parts[2].split(/\s+/).filter(Boolean);
    }
    if (!seen.has(walletKey(wallet))) {
      seen.add(walletKey(wallet));
      wallets.push(wallet);
    }
  });
  return {wallets, problems};
}

export function normalizeWallets(raw: unknown): Wallet[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (w): w is Wallet =>
      !!w &&
      FAMILIES.includes(w.family) &&
      typeof w.address === 'string' &&
      fitsFamily(w.address, w.family),
  );
}

/** 0x1234…abcd, for a line too narrow for the whole address. */
export const shortAddress = (address: string): string =>
  address.length <= 16
    ? address
    : `${address.slice(0, 8)}…${address.slice(-6)}`;

/** The name a wallet goes by: its own, or its address when it has none. */
export const walletName = (w: Wallet): string => w.name.trim() || shortAddress(w.address);

const FILE_NAMES: Record<Family, string> = {
  evm: 'evm',
  bitcoin: 'btc',
  solana: 'sol',
  near: 'near',
  injective: 'inj',
  fetch: 'fet',
  cosmos: 'atom',
  osmosis: 'osmo',
};

const fileLine = (w: Wallet): string =>
  [FILE_NAMES[w.family], w.address, w.name, ...(w.pools?.length ? [w.pools.join(' ')] : [])]
    .join(', ')
    .replace(/(, )+$/, '');

/**
 * The addresses file brought in line with the list: the name of each listed
 * address is rewritten, addresses the file lacks are added at the end.
 * Comments and lines it cannot read are left as they are.
 */
export function syncWalletsFile(text: string, wallets: Wallet[]): string {
  const byKey = new Map(wallets.map(w => [walletKey(w), w]));
  const written = new Set<string>();
  const lines = text.split(/\r?\n/).map(raw => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      return raw;
    }
    const one = parseWallets(line).wallets[0];
    const known = one ? byKey.get(walletKey(one)) : undefined;
    if (!one || !known) {
      return raw;
    }
    written.add(walletKey(one));
    return fileLine({...one, name: known.name, pools: known.pools ?? one.pools});
  });
  const missing = wallets.filter(w => !written.has(walletKey(w))).map(fileLine);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return [...lines, ...missing].join('\n') + '\n';
}

/** The addresses file without the line of one address; see walletKey. */
export function dropFromWalletsFile(text: string, key: string): string {
  return text
    .split(/\r?\n/)
    .filter(raw => {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) {
        return true;
      }
      const one = parseWallets(line).wallets[0];
      return !one || walletKey(one) !== key;
    })
    .join('\n');
}
