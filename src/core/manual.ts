/**
 * Balances the user types: what the chains cannot tell (an account at an
 * exchange, a position in a protocol, cash) or what the plugin does not
 * read. A typed balance belongs to a wallet by its name, the same name its
 * addresses carry if it has any, and sits on a chain or off-chain. The
 * price comes from the market, so only coins of the search list, and euros
 * and dollars, can be typed.
 */
import {CHAIN_NAMES} from './chains';
import {Coin} from './model';
import {Holding} from './readers';

/** Where a balance held outside any chain sits: an exchange, a bank. */
export const OFF_CHAIN = 'Off-chain';

export const MANUAL_FILE =
  '/storage/emulated/0/MyStyle/Plugins/CryptoView/holdings.txt';
/** The same as the user finds it from the tablet's file manager. */
export const MANUAL_FILE_SHOWN = MANUAL_FILE.replace(
  '/storage/emulated/0/',
  '',
);

/** Cash, offered beside the coins of the list; always off-chain. */
export const CASH: Coin[] = [
  {id: 'cash:eur', symbol: 'EUR', name: 'Euro', rank: 0},
  {id: 'cash:usd', symbol: 'USD', name: 'US dollar', rank: 0},
];

/** The chains a balance can be typed on. */
export const TYPED_CHAINS: readonly string[] = [OFF_CHAIN, ...CHAIN_NAMES];

export interface ManualHolding {
  /** CoinGecko id, or one of CASH. */
  coin: string;
  symbol: string;
  name: string;
  quantity: number;
  /** One of TYPED_CHAINS; absent in what earlier versions stored. */
  chain?: string;
  note?: string;
}

/** The balances typed for one wallet. */
export interface ManualAccount {
  /** The wallet's name. */
  name: string;
  /** When its balances were last changed, ms since the epoch. */
  at: number;
  holdings: ManualHolding[];
}

/** What stands for a wallet where a typed balance names its address. */
export const manualWallet = (name: string): string => `manual:${name}`;

export const isCash = (coin: string): boolean => coin.startsWith('cash:');

export const chainOf = (holding: ManualHolding): string =>
  isCash(holding.coin) ? OFF_CHAIN : holding.chain ?? OFF_CHAIN;

/** A holding the user typed rather than one read on a chain. */
export const isTyped = (holding: {wallet: string}): boolean =>
  holding.wallet.startsWith(manualWallet(''));

/** Typed cash: it has no price paid and no gain. */
export const isManualCash = (holding: Holding): boolean =>
  isTyped(holding) && holding.coinId === null;

/**
 * The typed balances as holdings of the portfolio. Cash is priced in
 * dollars: one for a dollar, and for a euro as many as `usdEur` gives.
 */
export function manualHoldings(
  accounts: ManualAccount[],
  usdEur: number | null,
): Holding[] {
  return accounts.flatMap(account =>
    account.holdings.map(holding => {
      const wallet = manualWallet(account.name);
      const cash = isCash(holding.coin);
      const chain = chainOf(holding);
      return {
        // Off-chain keeps the source of earlier versions: the prices paid
        // typed then are kept under it.
        source: chain === OFF_CHAIN ? wallet : `${wallet}|${chain}`,
        wallet,
        chain,
        symbol: holding.symbol,
        name: holding.name,
        quantity: holding.quantity,
        coinId: cash ? null : holding.coin,
        note: holding.note,
        usd: !cash
          ? undefined
          : holding.coin === 'cash:usd'
          ? 1
          : usdEur !== null && usdEur > 0
          ? 1 / usdEur
          : null,
      };
    }),
  );
}

/** The CoinGecko ids typed, to be priced. */
export const manualCoinIds = (accounts: ManualAccount[]): string[] =>
  accounts.flatMap(account =>
    account.holdings
      .map(holding => holding.coin)
      .filter(coin => !isCash(coin)),
  );

/**
 * The balances with one changed: a coin on a chain in a wallet, its
 * quantity set or, with null, removed. A wallet with no typed balance yet
 * gets them; one left with none keeps its empty list, so that a wallet
 * without addresses stays.
 */
export function setManual(
  accounts: ManualAccount[],
  name: string,
  coin: Coin,
  chain: string,
  quantity: number | null,
  at: number = Date.now(),
): ManualAccount[] {
  const where = isCash(coin.id) ? OFF_CHAIN : chain;
  const same = (h: ManualHolding) => h.coin === coin.id && chainOf(h) === where;
  const all = accounts.some(account => account.name === name)
    ? accounts
    : [...accounts, {name, at, holdings: []}];
  return all.map(account => {
    if (account.name !== name) {
      return account;
    }
    const before = account.holdings.find(same);
    return {
      ...account,
      at,
      holdings:
        quantity === null
          ? account.holdings.filter(h => !same(h))
          : before
          ? account.holdings.map(h => (h === before ? {...h, quantity} : h))
          : [
              ...account.holdings,
              {
                coin: coin.id,
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                quantity,
                chain: where,
              },
            ],
    };
  });
}

/** Why a name cannot be given to a wallet, or '' when it can. */
export function walletNameProblem(name: string, taken: string[]): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'Type a name.';
  }
  if (/[,;#]/.test(trimmed)) {
    return 'A name cannot hold a comma, a semicolon or #.';
  }
  if (taken.some(other => other.toLowerCase() === trimmed.toLowerCase())) {
    return `"${trimmed}" is already the name of a wallet.`;
  }
  return '';
}

/** Balances as stored by this or an earlier version, cleaned. */
export function normalizeManual(raw: unknown): ManualAccount[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (a): a is ManualAccount =>
        !!a && typeof a.name === 'string' && Array.isArray(a.holdings),
    )
    .map(a => ({
      name: a.name,
      at: typeof a.at === 'number' ? a.at : 0,
      holdings: a.holdings.filter(
        h =>
          !!h &&
          typeof h.coin === 'string' &&
          typeof h.symbol === 'string' &&
          typeof h.quantity === 'number' &&
          isFinite(h.quantity) &&
          h.quantity >= 0 &&
          (h.chain === undefined || TYPED_CHAINS.includes(h.chain)),
      ),
    }));
}

/** What the file starts with: its format, ready to fill in. */
export const MANUAL_TEMPLATE = `# CryptoView - balances you type, beside what your addresses hold.
# One balance per line:   wallet, chain, coin, quantity, note
# The wallet is a name: the same as your addresses' to join that wallet.
# The chain is Off-chain (an exchange, a bank) or one the plugin reads:
# ${TYPED_CHAINS.join(', ')}.
# The coin is its symbol (BTC) or, when several coins share a symbol, its
# CoinGecko id (bitcoin). EUR and USD are cash, always Off-chain.
# The quantity is written with a dot: 0.25. The note can be left out.
# Lines starting with # are ignored. Import replaces every typed balance.
`;

/** A quantity as the file takes it; 1e-7, as written by hand, too. */
const QUANTITY = /^(\d*\.?\d+)(e[+-]?\d+)?$/i;

/** A quantity in plain digits, never as 1e-7: anybody can read it. */
export function plainQuantity(quantity: number): string {
  const [digits, power] = String(quantity).split('e');
  if (power === undefined) {
    return digits;
  }
  const [whole, part = ''] = digits.split('.');
  const shift = Number(power);
  const all = whole + part;
  const point = whole.length + shift;
  const text =
    point <= 0
      ? `0.${'0'.repeat(-point)}${all}`
      : point >= all.length
      ? all + '0'.repeat(point - all.length)
      : `${all.slice(0, point)}.${all.slice(point)}`;
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Every typed balance, as the file holds it. */
export function manualFileText(
  accounts: ManualAccount[],
  coins: Coin[],
): string {
  // A symbol that more than one coin of the list carries is written as the id.
  const carried = new Map<string, number>();
  for (const coin of coins) {
    const symbol = coin.symbol.toUpperCase();
    carried.set(symbol, (carried.get(symbol) ?? 0) + 1);
  }
  const rows = accounts.flatMap(account =>
    account.holdings.map(holding => {
      const symbol = holding.symbol.toUpperCase();
      const coin =
        isCash(holding.coin) || (carried.get(symbol) ?? 0) === 1
          ? symbol
          : holding.coin;
      return [
        account.name,
        chainOf(holding),
        coin,
        plainQuantity(holding.quantity),
        holding.note ?? '',
      ]
        .join(', ')
        .replace(/, $/, '');
    }),
  );
  return MANUAL_TEMPLATE + rows.join('\n') + (rows.length > 0 ? '\n' : '');
}

/** The chain of TYPED_CHAINS a word of the file names, if any. */
const typedChain = (word: string): string | undefined => {
  const plain = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (plain === 'manual' || plain === 'offchain') {
    return OFF_CHAIN;
  }
  return TYPED_CHAINS.find(
    chain => chain.toLowerCase().replace(/[^a-z0-9]/g, '') === plain,
  );
};

/**
 * The balances a file describes. A coin is looked for by id first, then by
 * symbol, the largest coin first: `notes` says when a symbol was shared.
 * A line that cannot be read is listed in `problems`, never guessed. The
 * file of earlier versions, with no chain, is read as off-chain. Wallet
 * names are told apart regardless of case, as everywhere else.
 */
export function parseManualFile(
  text: string,
  coins: Coin[],
  at: number = Date.now(),
  /** The wallets that exist: a name differing in case only is theirs. */
  wallets: string[] = [],
): {accounts: ManualAccount[]; problems: string[]; notes: string[]} {
  const all = [...CASH, ...coins];
  const byId = new Map(all.map(coin => [coin.id.toLowerCase(), coin]));
  const accounts: ManualAccount[] = [];
  const problems: string[] = [];
  const notes: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      return;
    }
    const where = `Line ${index + 1}`;
    const fields = line.split(',').map(part => part.trim());
    // A coin can share its name with a chain (NEAR): with a quantity in
    // third place, the line has no chain, as in earlier versions.
    const named =
      fields.length > 3 && !QUANTITY.test(fields[2])
        ? typedChain(fields[1])
        : undefined;
    const [name = '', typed = '', amount = '', ...rest] = named
      ? [fields[0], ...fields.slice(2)]
      : fields;
    const chain = named ?? OFF_CHAIN;
    if (name === '' || typed === '' || amount === '') {
      problems.push(`${where}: wallet, chain, coin and quantity are needed.`);
      return;
    }
    if (rest.length > 1 || /^\d+$/.test(rest[0] ?? '')) {
      problems.push(`${where}: too many commas (a decimal takes a dot).`);
      return;
    }
    const quantity = Number(amount);
    if (!QUANTITY.test(amount) || !isFinite(quantity)) {
      problems.push(`${where}: "${amount}" is not a quantity.`);
      return;
    }
    const wanted = typed.toLowerCase();
    let coin = byId.get(wanted) ?? byId.get(`cash:${wanted}`);
    if (!coin) {
      const same = coins.filter(c => c.symbol.toLowerCase() === wanted);
      coin = same.sort((a, b) => a.rank - b.rank)[0];
      if (same.length > 1) {
        notes.push(
          `${where}: ${same.length} coins are ${typed.toUpperCase()}, ` +
            `${coin.name} (${coin.id}) was taken.`,
        );
      }
    }
    if (!coin) {
      problems.push(`${where}: "${typed}" is not in the list of coins.`);
      return;
    }
    if (isCash(coin.id) && chain !== OFF_CHAIN) {
      problems.push(`${where}: cash is always Off-chain.`);
      return;
    }
    const sameName = (other: string) =>
      other.toLowerCase() === name.toLowerCase();
    let account = accounts.find(a => sameName(a.name));
    if (!account) {
      account = {name: wallets.find(sameName) ?? name, at, holdings: []};
      accounts.push(account);
    }
    if (
      account.holdings.some(h => h.coin === coin!.id && chainOf(h) === chain)
    ) {
      problems.push(
        `${where}: ${coin.symbol} on ${chain} is already in ${account.name}.`,
      );
      return;
    }
    const note = rest[0] ?? '';
    account.holdings.push({
      coin: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      quantity,
      chain,
      ...(note !== '' ? {note} : {}),
    });
  });
  return {accounts, problems, notes};
}
