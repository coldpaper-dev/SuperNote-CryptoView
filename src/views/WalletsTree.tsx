import React, {useContext, useState} from 'react';
import {
  chainCols,
  coinCols,
  Col,
  KeySort,
  shown,
  sortItems,
  sortShown,
  TableId,
  turned,
  walletCols,
} from '../core/columns';
import {StyleSheet, Text, View} from 'react-native';
import {fmtPrice, fmtWhen} from '../core/format';
import {GroupAddress, GroupChain, WalletGroup} from '../core/groups';
import {Coin, Currency, Quote} from '../core/model';
import {Box, DataTable, H2, Label, P, PickedColumns, s, Small} from '../ui/kit';
import {QrCode} from '../ui/QrCode';
import {QuantityEditor} from './WalletsSettings';
import {isTyped, OFF_CHAIN} from '../core/manual';

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const BY_VALUE: KeySort = {key: 'value', descending: true};

// What is unfolded and how it is sorted is kept for the session: coming
// back from a coin or a QR code must find the page as it was left.
const kept = {
  wallets: new Set<string>(),
  chains: new Set<string>(),
  /** The coin of a manual account whose quantity is being changed. */
  editing: null as string | null,
  sorts: [BY_VALUE, BY_VALUE, BY_VALUE] as (KeySort | null)[],
};

const chainKey = (group: WalletGroup, chain: GroupChain): string =>
  `${group.name}|${chain.chain}|${chain.address}`;

const t = StyleSheet.create({
  inWallet: {paddingLeft: s(22), gap: s(4)},
  inChain: {paddingLeft: s(22), gap: s(4)},
  copy: {alignItems: 'flex-end'},
});

/**
 * Wallets, unfolded in place: a wallet shows its chains, a chain its coins.
 * Typed balances sit on chains marked "typed", and their quantity can be
 * changed there. Chains and coins under the dust threshold are left out.
 */
export function WalletsTree(props: {
  groups: WalletGroup[];
  currency: Currency;
  total: number;
  quotes: Record<string, Quote>;
  onAddress: (address: string) => void;
  onCoin: (line: string) => void;
  /** Sets a typed balance of a wallet; null removes it. */
  onManual: (
    account: string,
    coin: Coin,
    chain: string,
    quantity: number | null,
  ) => void;
  /** The "Copy to note" button of one wallet, given what is unfolded in it. */
  copy: (
    group: WalletGroup,
    open: (chain: GroupChain) => boolean,
  ) => React.ReactNode;
}) {
  const {groups, currency, quotes} = props;
  const [, redraw] = useState(0);
  const {picked} = useContext(PickedColumns);
  if (groups.length === 0) {
    return (
      <P>
        No wallet yet. Create one in Settings, Wallets, then add its public
        addresses or type its balances.
      </P>
    );
  }
  const toggle = (set: Set<string>, key: string) => {
    if (!set.delete(key)) {
      set.add(key);
    }
    redraw(n => n + 1);
  };
  /** The title, the sort and the tap on a title of one level of the tree. */
  const level = <T,>(index: 0 | 1 | 2, table: TableId, all: Col<T>[]) => {
    const cols = shown(all, picked[table]);
    return {
      all,
      cols,
      sorted: (items: T[]) => sortItems(all, kept.sorts[index], items),
      head: {
        columns: cols,
        sort: sortShown(cols, kept.sorts[index]),
        onSort: (column: number) => {
          kept.sorts[index] = turned(all, kept.sorts[index], cols[column].key);
          redraw(n => n + 1);
        },
      },
    };
  };
  /** The cells of a row that unfolds: an arrow in front of its name. */
  const unfolding = <T,>(cols: Col<T>[], item: T, open: boolean): string[] =>
    cols.map(
      (col, i) => (i === 0 ? (open ? '▼ ' : '▶ ') : '') + col.text(item),
    );
  // A chain or a coin found in several wallets counts once.
  const listed = groups.flatMap(group => group.chains);
  const chains = new Set(
    listed.map(chain => chain.chain).filter(name => name !== OFF_CHAIN),
  );
  const coins = new Set(
    listed.flatMap(chain => chain.rows.map(row => row.line)),
  );
  const top = level(0, 'wallets', walletCols({currency, quotes}));

  /** The coins of a chain; typed ones can be changed. */
  const coinsOf = (chain: GroupChain, account?: string) => {
    const table = level(2, 'coins', coinCols({chain, currency, quotes}));
    return (
      <View style={t.inChain}>
        <DataTable
          choices={{table: 'coins', all: table.all}}
          {...table.head}
          rows={table.sorted(chain.rows).map((row, i) => {
            const key = `${row.line}.${row.symbol}.${row.note ?? ''}.${i}`;
            if (account === undefined) {
              return {
                key,
                cells: table.cols.map(col => col.text(row)),
                onPress: () => props.onCoin(row.line),
              };
            }
            const coin: Coin = {
              id: row.coinId ?? `cash:${row.symbol.toLowerCase()}`,
              symbol: row.symbol,
              name: row.symbol,
              rank: 0,
            };
            const id = `${account}|${chain.chain}|${coin.id}`;
            const edited = kept.editing === id;
            const stop = () => {
              kept.editing = null;
              redraw(n => n + 1);
            };
            return {
              key,
              cells: table.cols.map(col => col.text(row)),
              onPress: () => props.onCoin(row.line),
              buttons: {
                quantity: () => {
                  kept.editing = edited ? null : id;
                  redraw(n => n + 1);
                },
              },
              after: edited ? (
                <QuantityEditor
                  account={account}
                  chain={chain.chain}
                  symbol={row.symbol}
                  quantity={row.quantity}
                  onSave={quantity => {
                    props.onManual(account, coin, chain.chain, quantity);
                    stop();
                  }}
                  onRemove={() => {
                    props.onManual(account, coin, chain.chain, null);
                    stop();
                  }}
                  onCancel={stop}
                />
              ) : undefined,
            };
          })}
        />
      </View>
    );
  };
  const chainsOf = (group: WalletGroup) => {
    const typed = group.manual && (
      <Small>
        Lines marked "typed" are balances you typed
        {group.manual.at > 0 ? `, last changed ${fmtWhen(group.manual.at)}` : ''}
        : tap a quantity to change it. Add one in Settings, Wallets.
      </Small>
    );
    if (group.chains.length === 0) {
      return (
        <View style={t.inWallet}>
          <Small>Nothing above the dust threshold in this wallet.</Small>
          {typed}
        </View>
      );
    }
    const table = level(1, 'chains', chainCols({group, currency}));
    return (
      <View style={t.inWallet}>
        <View style={t.copy}>
          {props.copy(group, chain => kept.chains.has(chainKey(group, chain)))}
        </View>
        <DataTable
          choices={{table: 'chains', all: table.all}}
          {...table.head}
          rows={table.sorted(group.chains).map(chain => {
            const key = chainKey(group, chain);
            const unfolded = kept.chains.has(key);
            const manual = isTyped({wallet: chain.address});
            return {
              key,
              cells: unfolding(table.cols, chain, unfolded),
              onPress: () => toggle(kept.chains, key),
              ...(manual
                ? {}
                : {
                    buttons: {address: () => props.onAddress(chain.address)},
                    tags: {address: 'QR'},
                  }),
              after: unfolded
                ? coinsOf(chain, manual ? group.name : undefined)
                : undefined,
            };
          })}
        />
        {typed}
      </View>
    );
  };
  return (
    <>
      <Box>
        <Label>Total</Label>
        <H2>{fmtPrice(props.total, currency)}</H2>
        <Small>
          {plural(groups.length, 'wallet')} · {plural(chains.size, 'chain')} ·{' '}
          {plural(coins.size, 'coin')}
        </Small>
      </Box>
      <DataTable
        choices={{table: 'wallets', all: top.all}}
        {...top.head}
        rows={top.sorted(groups).map(group => {
          const open = kept.wallets.has(group.name);
          return {
            key: group.name,
            cells: unfolding(top.cols, group, open),
            onPress: () => toggle(kept.wallets, group.name),
            after: open ? chainsOf(group) : undefined,
          };
        })}
      />
      {groups.some(group => group.pnlPartial) && (
        <Small>
          ~ gain on part of the coins only: the others have no price paid.
        </Small>
      )}
      {listed.some(chain => chain.rows.some(row => row.stale)) && (
        <Small>* amount from an earlier read.</Small>
      )}
    </>
  );
}

const q = StyleSheet.create({
  address: {textAlign: 'center'},
});

/** One public address in full, with its QR code. */
export function AddressView(props: {address: GroupAddress; wallet: string}) {
  const {address} = props;
  return (
    <>
      <Label>
        {props.wallet} · {address.kind}
      </Label>
      <QrCode text={address.address} />
      <P>
        <Text selectable style={q.address}>
          {address.address}
        </Text>
      </P>
      <Small>
        A public address: scanning it lets a phone or a hardware wallet watch it
        or send to it. It gives no access to the coins.
        {address.family === 'evm'
          ? ' The same address serves every EVM chain and Hyperliquid.'
          : ''}
      </Small>
      <Small>
        Check the first and last characters on the other device before sending.
      </Small>
    </>
  );
}
