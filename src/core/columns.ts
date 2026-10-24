/**
 * The columns each table can show. The first one names the row and is
 * always there; the user picks among the others, and "Copy to note" writes
 * the same ones as the screen.
 */
import {
  fmtChange,
  fmtGain,
  fmtLarge,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtRank,
  fmtSignedPct,
  fmtSignedPrice,
} from './format';
import {GroupChain, GroupRow, WalletGroup} from './groups';
import {Currency, Quote} from './model';
import {isTyped} from './manual';
import {Line, Part} from './portfolio';
import {sortBy} from './sort';
import {nameOf, shortAddress} from './wallets';

export interface Col<T> {
  key: string;
  label: string;
  /** Text to the left; figures go to the right. */
  left?: boolean;
  /** Shown until the user chooses otherwise. */
  on?: boolean;
  text: (item: T) => string;
  /** What the column sorts by; a row without the figure goes last. */
  sort: (item: T) => number | string | null;
}

/** Names of the tables, as the choice of their columns is stored. */
export type TableId =
  | 'portfolio'
  | 'asset'
  | 'wallets'
  | 'chains'
  | 'coins'
  | 'market';

/**
 * The columns to show: the first, then the ones picked in the order they
 * were picked; the usual ones, in their own order, until the user chooses.
 */
export function shown<T>(
  all: Col<T>[],
  picked: string[] | undefined,
): Col<T>[] {
  if (!picked) {
    return all.filter((col, i) => i === 0 || col.on);
  }
  const rest = all.slice(1);
  return [
    all[0],
    ...picked
      .map(key => rest.find(col => col.key === key))
      .filter((col): col is Col<T> => !!col),
  ];
}

/** The column a table is sorted by, wherever it stands, and which way. */
export interface KeySort {
  key: string;
  descending: boolean;
}

/** The items in the order asked; as given when no column is. */
export function sortItems<T>(
  all: Col<T>[],
  sort: KeySort | null,
  items: T[],
): T[] {
  const col = sort && all.find(one => one.key === sort.key);
  return col ? sortBy(items, col.sort, sort!.descending) : items;
}

/** A tap on a title: the other way round, or a new column from its top. */
export function turned<T>(
  all: Col<T>[],
  sort: KeySort | null,
  key: string,
): KeySort {
  const index = all.findIndex(col => col.key === key);
  return {
    key,
    // Names start from A, figures from the largest.
    descending:
      sort?.key === key ? !sort.descending : index > 0 && !all[index].left,
  };
}

/** Where the sorted column stands among the ones shown, if it is. */
export function sortShown<T>(
  cols: Col<T>[],
  sort: KeySort | null,
): {index: number; descending: boolean} | undefined {
  const index = sort ? cols.findIndex(col => col.key === sort.key) : -1;
  return index < 0 ? undefined : {index, descending: sort!.descending};
}

/** A table as rows of text, titles first, for a note. */
export const tableText = <T>(cols: Col<T>[], items: T[]): string[][] => [
  cols.map(col => col.label.toUpperCase()),
  ...items.map(item => cols.map(col => col.text(item))),
];

const share = (part: number | null, whole: number): number | null =>
  part !== null && whole > 0 ? (part / whole) * 100 : null;
const count = <T>(items: T[]): number => new Set(items).size;
const price = (value: number | null | undefined, currency: Currency): string =>
  fmtPrice(value ?? null, currency);
const large = (value: number | null | undefined, currency: Currency): string =>
  fmtLarge(value ?? null, currency);
const quantity = (value: number | null | undefined): string =>
  value == null ? '-' : fmtNumber(value);

/**
 * Change over a period of several coins taken together, had the same
 * amounts been held all along; null when none of them has the figure.
 */
function changeOf(
  parts: {value: number | null; change: number | null | undefined}[],
): number | null {
  let now = 0;
  let then = 0;
  let known = false;
  for (const part of parts) {
    if (part.value !== null && part.value > 0) {
      now += part.value;
      then += part.value / (1 + (part.change ?? 0) / 100);
      known = known || part.change != null;
    }
  }
  return known && then > 0 ? (now / then - 1) * 100 : null;
}

export function portfolioCols(c: {
  currency: Currency;
  quotes: Record<string, Quote>;
  total: number;
  names: Record<string, string>;
}): Col<Line>[] {
  const {currency} = c;
  const quote = (line: Line): Quote | undefined => c.quotes[line.key];
  const wallets = (line: Line) =>
    count(line.parts.map(part => nameOf(c.names, part.wallet)));
  return [
    {
      key: 'coin',
      label: 'Coin',
      text: line => line.symbol + (line.stale ? ' *' : ''),
      sort: line => line.symbol.toUpperCase(),
    },
    {
      key: 'chains',
      label: 'Chains',
      text: line => String(count(line.parts.map(part => part.chain))),
      sort: line => count(line.parts.map(part => part.chain)),
    },
    {
      key: 'wallets',
      label: 'Wallets',
      text: line => String(wallets(line)),
      sort: wallets,
    },
    {
      key: 'quantity',
      label: 'Quantity',
      on: true,
      text: line => fmtNumber(line.quantity),
      sort: line => line.quantity,
    },
    {
      key: 'price',
      label: 'Price',
      on: true,
      text: line => fmtPrice(line.price, currency),
      sort: line => line.price,
    },
    {
      key: 'value',
      label: 'Value',
      on: true,
      text: line => fmtPrice(line.value, currency),
      sort: line => line.value,
    },
    {
      key: 'share',
      label: '% total',
      text: line => fmtPct(share(line.value, c.total)),
      sort: line => line.value,
    },
    {
      key: 'unitCost',
      label: 'Paid / coin',
      text: line => fmtPrice(line.unitCost, currency),
      sort: line => line.unitCost,
    },
    {
      key: 'cost',
      label: 'Cost',
      text: line => fmtPrice(line.paid, currency),
      sort: line => line.paid,
    },
    {
      key: 'pnl',
      label: 'PnL',
      on: true,
      text: line =>
        line.pnl === null
          ? '-'
          : fmtSignedPrice(line.pnl, currency) + (line.pnlPartial ? ' ~' : ''),
      sort: line => line.pnl,
    },
    {
      key: 'pnlPct',
      label: 'PnL%',
      on: true,
      text: line => (line.pnlPct === null ? '-' : fmtSignedPct(line.pnlPct)),
      sort: line => line.pnlPct,
    },
    {
      key: 'h24',
      label: '24h',
      text: line => fmtChange(line.change24h),
      sort: line => line.change24h,
    },
    {
      key: 'd7',
      label: '7d',
      text: line => fmtChange(quote(line)?.changes.d7 ?? null),
      sort: line => quote(line)?.changes.d7 ?? null,
    },
    {
      key: 'd30',
      label: '30d',
      text: line => fmtChange(quote(line)?.changes.d30 ?? null),
      sort: line => quote(line)?.changes.d30 ?? null,
    },
    {
      key: 'rank',
      label: 'Rank',
      text: line => fmtRank(quote(line)?.rank ?? 0),
      sort: line => quote(line)?.rank || null,
    },
    {
      key: 'cap',
      label: 'Mkt cap',
      text: line => large(quote(line)?.marketCap, currency),
      sort: line => quote(line)?.marketCap ?? null,
    },
    {
      key: 'volume',
      label: 'Vol 24h',
      text: line => large(quote(line)?.volume, currency),
      sort: line => quote(line)?.volume ?? null,
    },
    {
      key: 'ath',
      label: 'From ATH',
      text: line => fmtChange(quote(line)?.athChange ?? null),
      sort: line => quote(line)?.athChange ?? null,
    },
  ];
}

/** A favorite, with its quote when the price source knows it. */
export interface MarketRow {
  id: string;
  quote?: Quote;
}

export function marketCols(c: {
  currency: Currency;
  /** The portfolio lines, by coin id. */
  held: Record<string, Line>;
}): Col<MarketRow>[] {
  const {currency} = c;
  type Pick<V> = (quote: Quote) => V;
  const col = (
    key: string,
    label: string,
    text: Pick<string>,
    sort: Pick<number | string | null>,
    on?: boolean,
  ): Col<MarketRow> => ({
    key,
    label,
    on,
    text: row => (row.quote ? text(row.quote) : '-'),
    sort: row => (row.quote ? sort(row.quote) : null),
  });
  const change = (
    key: string,
    label: string,
    pick: Pick<number | null>,
    on?: boolean,
  ) => col(key, label, q => fmtChange(pick(q)), pick, on);
  const money = (
    key: string,
    label: string,
    pick: Pick<number | null | undefined>,
  ) =>
    col(
      key,
      label,
      q => price(pick(q), currency),
      q => pick(q) ?? null,
    );
  const big = (
    key: string,
    label: string,
    pick: Pick<number | null | undefined>,
    on?: boolean,
  ) =>
    col(
      key,
      label,
      q => large(pick(q), currency),
      q => pick(q) ?? null,
      on,
    );
  return [
    {
      key: 'coin',
      label: 'Coin',
      text: row => row.quote?.symbol ?? row.id,
      sort: row => (row.quote?.symbol ?? row.id).toUpperCase(),
    },
    col(
      'held',
      'You hold',
      q => quantity(c.held[q.id]?.quantity),
      q => c.held[q.id]?.quantity ?? null,
    ),
    col(
      'price',
      'Price',
      q => fmtPrice(q.price, currency),
      q => q.price,
      true,
    ),
    col(
      'heldValue',
      'Your value',
      q => price(c.held[q.id]?.value, currency),
      q => c.held[q.id]?.value ?? null,
    ),
    change('h1', '1h', q => q.changes.h1),
    change('h24', '24h', q => q.changes.h24, true),
    change('d7', '7d', q => q.changes.d7, true),
    change('d14', '14d', q => q.changes.d14),
    change('d30', '30d', q => q.changes.d30, true),
    change('d200', '200d', q => q.changes.d200),
    change('y1', '1y', q => q.changes.y1),
    col(
      'rank',
      'Rank',
      q => fmtRank(q.rank),
      q => q.rank || null,
      true,
    ),
    big('cap', 'Mkt cap', q => q.marketCap),
    big('fdv', 'FDV', q => q.fdv),
    big('volume', 'Vol 24h', q => q.volume, true),
    money('high', '24h high', q => q.high24h),
    money('low', '24h low', q => q.low24h),
    money('ath', 'ATH', q => q.ath),
    change('athChange', 'From ATH', q => q.athChange),
    money('atl', 'ATL', q => q.atl),
    change('atlChange', 'From ATL', q => q.atlChange ?? null),
    col(
      'circulating',
      'Circulating',
      q => quantity(q.circulating),
      q => q.circulating ?? null,
    ),
    col(
      'max',
      'Max supply',
      q => quantity(q.maxSupply),
      q => q.maxSupply ?? null,
    ),
  ];
}

/** What a holding cost: its quantity at the price paid. */
export const costOf = (part: Part): number | null =>
  part.unitCost === null ? null : part.quantity * part.unitCost;

export function partCols(c: {
  line: Line;
  names: Record<string, string>;
  currency: Currency;
}): Col<Part>[] {
  const {line, currency} = c;
  const wallet = (part: Part): string =>
    nameOf(c.names, part.wallet) + (part.note ? `, ${part.note}` : '');
  /** The symbol of a part when it is not the coin of the line itself. */
  const own = (part: Part): string =>
    part.symbol.toUpperCase() !== line.symbol.toUpperCase()
      ? ` ${part.symbol}`
      : '';
  const pct = (part: Part): number | null => {
    const cost = costOf(part);
    return part.pnl !== null && cost !== null && cost > 0
      ? (part.pnl / cost) * 100
      : null;
  };
  return [
    {
      key: 'chain',
      label: 'Chain',
      text: part => part.chain + (part.stale ? ' *' : ''),
      sort: part => part.chain.toUpperCase(),
    },
    {
      key: 'wallet',
      label: 'Wallet',
      left: true,
      on: true,
      text: wallet,
      sort: part => wallet(part).toUpperCase(),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      on: true,
      text: part => fmtNumber(part.quantity) + own(part),
      // Counted in the coin of the line, so that forms compare.
      sort: part => part.quantity * (part.factor ?? 1),
    },
    {
      key: 'value',
      label: 'Value',
      text: part => fmtPrice(part.value, currency),
      sort: part => part.value,
    },
    {
      key: 'share',
      label: '% coin',
      text: part => fmtPct(share(part.value, line.value ?? 0)),
      sort: part => part.value,
    },
    {
      key: 'unitCost',
      label: 'Paid / coin',
      on: true,
      text: part =>
        part.unitCost === null
          ? 'set'
          : fmtPrice(part.unitCost, currency) + (part.typed ? '' : ' ¹'),
      sort: part => part.unitCost,
    },
    {
      key: 'cost',
      label: 'Cost',
      on: true,
      text: part => fmtPrice(costOf(part), currency),
      sort: costOf,
    },
    {
      key: 'pnl',
      label: 'PnL',
      on: true,
      text: part =>
        part.pnl === null ? '-' : fmtSignedPrice(part.pnl, currency),
      sort: part => part.pnl,
    },
    {
      key: 'pnlPct',
      label: 'PnL%',
      text: part => (pct(part) === null ? '-' : fmtSignedPct(pct(part)!)),
      sort: pct,
    },
  ];
}

export function walletCols(c: {
  currency: Currency;
  quotes: Record<string, Quote>;
}): Col<WalletGroup>[] {
  const {currency} = c;
  const rows = (group: WalletGroup) =>
    group.chains.flatMap(chain => chain.rows);
  const coins = (group: WalletGroup) => count(rows(group).map(row => row.line));
  const h24 = (group: WalletGroup) =>
    changeOf(
      rows(group).map(row => ({
        value: row.value,
        change: c.quotes[row.line]?.changes.h24,
      })),
    );
  return [
    {
      key: 'wallet',
      label: 'Wallet',
      text: group => group.name,
      sort: group => group.name.toUpperCase(),
    },
    {
      key: 'chains',
      label: 'Chains',
      on: true,
      text: group => String(group.chains.length),
      sort: group => group.chains.length,
    },
    {
      key: 'coins',
      label: 'Coins',
      text: group => String(coins(group)),
      sort: coins,
    },
    {
      key: 'value',
      label: 'Value',
      on: true,
      text: group => fmtPrice(group.value, currency),
      sort: group => group.value,
    },
    {
      key: 'share',
      label: '%',
      on: true,
      text: group => (group.share === null ? '-' : group.share.toFixed(1)),
      sort: group => group.share,
    },
    {
      key: 'pnl',
      label: 'PnL',
      on: true,
      text: group =>
        fmtGain(group.pnl, group.paid, currency) +
        (group.pnlPartial ? ' ~' : ''),
      sort: group => group.pnl,
    },
    {
      key: 'h24',
      label: '24h',
      text: group => fmtChange(h24(group)),
      sort: h24,
    },
  ];
}

export function chainCols(c: {
  group: WalletGroup;
  currency: Currency;
}): Col<GroupChain>[] {
  const {currency} = c;
  const sum = (
    chain: GroupChain,
    pick: (row: GroupRow) => number | null,
  ): number | null => {
    const known = chain.rows.map(pick).filter((v): v is number => v !== null);
    return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  };
  const pnl = (chain: GroupChain) => sum(chain, row => row.pnl);
  return [
    {
      key: 'chain',
      label: 'Chain',
      text: chain => chain.chain,
      sort: chain => chain.chain.toUpperCase(),
    },
    {
      key: 'address',
      label: 'Address',
      left: true,
      on: true,
      text: chain =>
        isTyped({wallet: chain.address}) ? 'typed' : shortAddress(chain.address),
      sort: chain => chain.address,
    },
    {
      key: 'coins',
      label: 'Coins',
      text: chain => String(chain.rows.length),
      sort: chain => chain.rows.length,
    },
    {
      key: 'value',
      label: 'Value',
      on: true,
      text: chain => fmtPrice(chain.value, currency),
      sort: chain => chain.value,
    },
    {
      key: 'share',
      label: '% wallet',
      on: true,
      text: chain =>
        c.group.value > 0
          ? ((chain.value / c.group.value) * 100).toFixed(1)
          : '-',
      sort: chain => chain.value,
    },
    {
      key: 'pnl',
      label: 'PnL',
      text: chain =>
        fmtGain(
          pnl(chain),
          sum(chain, row => (row.pnl === null ? null : row.paid)),
          currency,
        ),
      sort: pnl,
    },
  ];
}

export function coinCols(c: {
  chain: GroupChain;
  currency: Currency;
  quotes: Record<string, Quote>;
}): Col<GroupRow>[] {
  const {currency} = c;
  const h24 = (row: GroupRow) => c.quotes[row.line]?.changes.h24 ?? null;
  const unit = (row: GroupRow) =>
    row.paid !== null && row.quantity > 0 ? row.paid / row.quantity : null;
  return [
    {
      key: 'coin',
      label: 'Coin',
      text: row =>
        row.symbol + (row.stale ? ' *' : '') + (row.note ? ` ${row.note}` : ''),
      sort: row => row.symbol.toUpperCase(),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      on: true,
      text: row => fmtNumber(row.quantity),
      sort: row => row.quantity,
    },
    {
      key: 'price',
      label: 'Price',
      on: true,
      text: row => fmtPrice(row.price, currency),
      sort: row => row.price,
    },
    {
      key: 'value',
      label: 'Value',
      on: true,
      text: row => fmtPrice(row.value, currency),
      sort: row => row.value,
    },
    {
      key: 'share',
      label: '% chain',
      text: row => fmtPct(share(row.value, c.chain.value)),
      sort: row => row.value,
    },
    {
      key: 'unitCost',
      label: 'Paid / coin',
      text: row => fmtPrice(unit(row), currency),
      sort: unit,
    },
    {
      key: 'pnl',
      label: 'PnL',
      on: true,
      text: row => fmtGain(row.pnl, row.paid, currency),
      sort: row => row.pnl,
    },
    {
      key: 'h24',
      label: '24h',
      text: row => fmtChange(h24(row)),
      sort: h24,
    },
  ];
}
