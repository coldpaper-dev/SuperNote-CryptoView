import React, {useContext, useState} from 'react';
import {
  KeySort,
  partCols,
  portfolioCols,
  shown,
  sortItems,
  sortShown,
  turned,
} from '../core/columns';
import {StyleSheet, View} from 'react-native';
import {
  decimalText,
  fmtChange,
  fmtGain,
  fmtNumber,
  fmtPrice,
  fmtWhen,
} from '../core/format';
import {isTyped, manualWallet} from '../core/manual';
import {Balances, Coin, Cost, Currency, Quote} from '../core/model';
import {Line, Part, Portfolio} from '../core/portfolio';
import {
  Box,
  Btn,
  Column,
  DataRow,
  DataTable,
  Field,
  Flex,
  H2,
  Label,
  MiniBtn,
  P,
  PickedColumns,
  Row,
  s,
  Small,
  TableHead,
  TableRow,
} from '../ui/kit';
import {QuantityEditor} from './WalletsSettings';

const LOOSE: Column[] = [
  {label: 'Coin', flex: 1, bold: true},
  {label: 'Quantity', flex: 1.5, right: true},
  {label: 'Where', flex: 2, right: true},
];

/** A moment always said with its day: these are read hours or days apart. */
const stamp = (at: number): string => fmtWhen(at, 0);

interface Props {
  portfolio: Portfolio;
  balances: Balances;
  /** When the prices were read. */
  pricesAt: number;
  /** Why the last refresh failed, or ''. */
  error: string;
  busy: boolean;
  onBalances: () => void;
  onPrices: () => void;
  currency: Currency;
  hasWallets: boolean;
  /** Open perp positions, one line each, in a card of their own. */
  perps: string[];
  /** Their PnL added up. */
  perpsPnl: string;
  /** For the columns that say more than the portfolio itself knows. */
  quotes: Record<string, Quote>;
  names: Record<string, string>;
  onOpen: (line: Line) => void;
}

/** Total first, then one line per coin, largest value first. */
export function PortfolioView(props: Props) {
  const {portfolio, balances, currency} = props;
  const [dustOpen, setDustOpen] = useState(false);
  const [spamOpen, setSpamOpen] = useState(false);
  const [sort, setSort] = useState<KeySort | null>({
    key: 'value',
    descending: true,
  });
  const {picked} = useContext(PickedColumns);
  if (!props.hasWallets) {
    return (
      <P>
        No address yet. Open Settings to add your public addresses; CryptoView
        then reads what they hold.
      </P>
    );
  }
  const all = portfolioCols({
    currency,
    quotes: props.quotes,
    total: portfolio.total,
    names: props.names,
  });
  const cols = shown(all, picked.portfolio);
  const dustValue = portfolio.dust.reduce((sum, line) => sum + line.value!, 0);
  const row = (line: Line): DataRow => ({
    key: line.key,
    cells: cols.map(col => col.text(line)),
    onPress: () => props.onOpen(line),
  });
  /** A line that folds others: its count and its value, where they show. */
  const fold = (
    name: string,
    open: boolean,
    lines: Line[],
    value: string,
    onPress: () => void,
  ): DataRow => {
    const said: Record<string, string> = {
      coin: `${name} ${open ? '▼' : '▶'}`,
      quantity: `${lines.length} coins`,
      value,
    };
    return {
      key: `fold ${name}`,
      cells: cols.map(col => said[col.key] ?? ''),
      onPress,
    };
  };
  const sorted = (lines: Line[]) => sortItems(all, sort, lines).map(row);
  const rows: DataRow[] = [
    ...sorted(portfolio.lines),
    ...(portfolio.dust.length > 0
      ? [
          fold(
            'Dust',
            dustOpen,
            portfolio.dust,
            fmtPrice(dustValue, currency),
            () => setDustOpen(!dustOpen),
          ),
        ]
      : []),
    ...(dustOpen ? sorted(portfolio.dust) : []),
    ...(portfolio.hidden.length > 0
      ? [
          fold('Spam', spamOpen, portfolio.hidden, 'not counted', () =>
            setSpamOpen(!spamOpen),
          ),
        ]
      : []),
    ...(spamOpen ? portfolio.hidden.map(row) : []),
  ];
  return (
    <>
      <Box>
        <View style={v.reads}>
          <View style={v.grow}>
            <Label>Total</Label>
          </View>
          <MiniBtn
            tiny
            label={`↻ Balances · ${stamp(balances.at)}`}
            disabled={props.busy}
            onPress={props.onBalances}
          />
          <MiniBtn
            tiny
            label={`↻ Prices · ${stamp(props.pricesAt)}`}
            disabled={props.busy}
            onPress={props.onPrices}
          />
        </View>
        <H2>{fmtPrice(portfolio.total, currency)}</H2>
        {portfolio.pnl !== null && (
          <P>
            PnL {fmtGain(portfolio.pnl, portfolio.paid, currency)}
            {portfolio.pnlPartial ? ' ~' : ''}
          </P>
        )}
        <Small>
          24h {fmtChange(portfolio.change24h)} · 7d{' '}
          {fmtChange(portfolio.change7d)} · 30d {fmtChange(portfolio.change30d)}
        </Small>
        {props.error !== '' && <Small>Not refreshed: {props.error}.</Small>}
        {balances.failed.length > 0 && (
          <>
            <Small>
              {balances.failed.length} of {balances.sources} balance reads
              failed; their last known amounts are shown:
            </Small>
            {balances.failed.map(line => (
              <Small key={line}>{line}</Small>
            ))}
          </>
        )}
      </Box>
      {props.perps.length > 0 && (
        <Box>
          <View style={v.reads}>
            <View style={v.grow}>
              <Label>Open perps on Hyperliquid</Label>
            </View>
            <P>PnL {props.perpsPnl}</P>
          </View>
          {props.perps.map(perp => (
            <Small key={perp}>• {perp}</Small>
          ))}
          <Small>Their margin is in the USDC line.</Small>
        </Box>
      )}
      <DataTable
        choices={{table: 'portfolio', all}}
        columns={cols}
        sort={sortShown(cols, sort)}
        onSort={index => setSort(turned(all, sort, cols[index].key))}
        rows={rows}
      />
      {portfolio.lines.length + portfolio.dust.length === 0 && (
        <P>Nothing read yet. Tap Refresh.</P>
      )}
      {portfolio.stale && <Small>* amount from an earlier read.</Small>}
      {(portfolio.pnlPartial ||
        portfolio.lines.some(line => line.pnlPartial)) && (
        <Small>
          ~ gain on part of the coins only: the others have no price paid.
        </Small>
      )}
      {portfolio.unpriced.length > 0 && (
        <>
          <Label>No price, not in the total</Label>
          <TableHead columns={LOOSE} />
          {portfolio.unpriced.map(line => (
            <TableRow
              key={line.key}
              columns={LOOSE}
              onPress={() => props.onOpen(line)}
              cells={[
                line.symbol,
                fmtNumber(line.quantity),
                line.parts.map(part => part.chain).join(', '),
              ]}
            />
          ))}
        </>
      )}
    </>
  );
}

const v = StyleSheet.create({
  reads: {flexDirection: 'row', alignItems: 'center', gap: s(6)},
  grow: {flex: 1},
});

/** Typing the price paid for one holding, in either currency. */
function CostEditor(props: {
  part: Part;
  currency: Currency;
  onSave: (cost: Cost | null) => void;
  onCancel: () => void;
}) {
  const {part} = props;
  const [text, setText] = useState(part.typed ? String(part.typed.price) : '');
  const [currency, setCurrency] = useState<Currency>(
    part.typed?.currency ?? props.currency,
  );
  const price = Number(text);
  const valid = /\d/.test(text) && isFinite(price);
  return (
    <Box>
      <Label>
        Price paid for one {part.symbol} on {part.chain}
      </Label>
      <Field
        value={text}
        onChangeText={typed => setText(decimalText(typed))}
        placeholder="0.00"
        autoFocus
      />
      <Row>
        <Flex>
          <Btn
            label="In €"
            selected={currency === 'eur'}
            onPress={() => setCurrency('eur')}
          />
        </Flex>
        <Flex>
          <Btn
            label="In $"
            selected={currency === 'usd'}
            onPress={() => setCurrency('usd')}
          />
        </Flex>
      </Row>
      <Row>
        <Flex>
          <Btn label="Cancel" onPress={props.onCancel} />
        </Flex>
        <Flex>
          <Btn
            label="Clear"
            disabled={!part.typed}
            onPress={() => props.onSave(null)}
          />
        </Flex>
        <Flex>
          <Btn
            label="Save"
            primary
            disabled={!valid}
            onPress={() => props.onSave({price, currency})}
          />
        </Flex>
      </Row>
      <Small>
        Your average buying price; 0 for a coin received for free, all of its
        value is then PnL. A price in the other currency is converted at today's
        rate, not the rate of the day you bought.
      </Small>
    </Box>
  );
}

/** Where the coins of one line are, and what was paid for them. */
export function Breakdown(props: {
  line: Line;
  names: Record<string, string>;
  currency: Currency;
  onCost: (key: string, cost: Cost | null) => void;
  /** Sets a typed balance of a wallet; null removes it. */
  onManual: (
    account: string,
    coin: Coin,
    chain: string,
    quantity: number | null,
  ) => void;
}) {
  const {line, currency} = props;
  const [editing, setEditing] = useState<string | null>(null);
  // As read until a column title is tapped.
  const [sort, setSort] = useState<KeySort | null>(null);
  const {picked} = useContext(PickedColumns);
  const forms = line.parts.filter(part => part.factor !== null);
  const all = partCols({line, names: props.names, currency});
  const cols = shown(all, picked.asset);
  return (
    <>
      <DataTable
        choices={{table: 'asset', all}}
        columns={cols}
        sort={sortShown(cols, sort)}
        onSort={index => setSort(turned(all, sort, cols[index].key))}
        rows={sortItems(all, sort, line.parts).map(part => {
          // What is being changed: the price paid, or a typed quantity.
          const cost = `cost:${part.costKey}`;
          const quantity = `quantity:${part.costKey}`;
          const toggle = (what: string) =>
            setEditing(editing === what ? null : what);
          const manual = isTyped(part);
          const account = part.wallet.slice(manualWallet('').length);
          const coin: Coin = {
            id: part.coinId ?? `cash:${part.symbol.toLowerCase()}`,
            symbol: part.symbol,
            name: part.name,
            rank: 0,
          };
          return {
            key: part.costKey,
            cells: cols.map(col => col.text(part)),
            buttons: {
              unitCost: () => toggle(cost),
              ...(manual ? {quantity: () => toggle(quantity)} : {}),
            },
            after:
              editing === cost ? (
                <CostEditor
                  part={part}
                  currency={currency}
                  onCancel={() => setEditing(null)}
                  onSave={typed => {
                    props.onCost(part.costKey, typed);
                    setEditing(null);
                  }}
                />
              ) : editing === quantity ? (
                <QuantityEditor
                  account={account}
                  chain={part.chain}
                  symbol={part.symbol}
                  quantity={part.quantity}
                  onCancel={() => setEditing(null)}
                  onSave={typed => {
                    props.onManual(account, coin, part.chain, typed);
                    setEditing(null);
                  }}
                  onRemove={() => {
                    props.onManual(account, coin, part.chain, null);
                    setEditing(null);
                  }}
                />
              ) : undefined,
          };
        })}
      />
      {line.parts.some(part => part.unitCost !== null && !part.typed) && (
        <Small>¹ price paid as recorded by the exchange.</Small>
      )}
      {forms.map((part, i) => (
        <Small key={i}>
          {fmtNumber(part.quantity)} {part.symbol} × {part.factor!.toFixed(4)} ={' '}
          {fmtNumber(part.quantity * part.factor!)} {line.symbol} ({part.chain})
        </Small>
      ))}
      {forms.length > 0 && (
        <Small>
          A staked or wrapped form is not worth exactly one {line.symbol}: the
          factor is its price over the price of {line.symbol}, read at each
          refresh.
        </Small>
      )}
    </>
  );
}
