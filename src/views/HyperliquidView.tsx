import React, {useState} from 'react';
import {
  fmtChange,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtShortTime,
  fmtSigned,
  fmtWhen,
  Money,
} from '../core/format';
import {
  fetchHlFills,
  HlAccount,
  HlFill,
  HlPosition,
  positionTitle,
} from '../core/hyperliquid';
import {nameOf, shortAddress} from '../core/wallets';
import {
  Banner,
  Box,
  Btn,
  Chart,
  Column,
  Flex,
  H2,
  Label,
  P,
  Row,
  Small,
  TableHead,
  TableRow,
} from '../ui/kit';

export type HlTab =
  | 'summary'
  | 'perps'
  | 'spot'
  | 'staking'
  | 'earn'
  | 'orders'
  | 'trades';
const HL_TABS: [HlTab, string][] = [
  ['summary', 'Summary'],
  ['perps', 'Perps'],
  ['spot', 'Spot'],
  ['staking', 'Staking'],
  ['earn', 'Earn'],
  ['orders', 'Open orders'],
  ['trades', 'Trade history'],
];

const pct = fmtPct;

const PAIRS: Column[] = [
  {label: 'a', flex: 1.2},
  {label: 'b', flex: 1, right: true, bold: true},
  {label: 'c', flex: 0.2},
  {label: 'd', flex: 1.2},
  {label: 'e', flex: 1, right: true, bold: true},
];
/** Two labelled values on one line. */
const Pair = (p: {a: string; av: string; b?: string; bv?: string}) => (
  <TableRow columns={PAIRS} cells={[p.a, p.av, '', p.b ?? '', p.bv ?? '']} />
);

const PERIODS: Column[] = [
  {label: 'Period', flex: 0.9, bold: true},
  {label: 'PnL', flex: 1, right: true},
  {label: 'Volume', flex: 1, right: true},
  {label: 'Perps PnL', flex: 1, right: true},
  {label: 'Perps vol.', flex: 1, right: true},
];
const SPANS = [
  ['day', '24 hours'],
  ['week', '7 days'],
  ['month', '30 days'],
  ['allTime', 'All time'],
] as const;
type Span = (typeof SPANS)[number][0];
const SPOT: Column[] = [
  {label: 'Coin', flex: 0.8, bold: true},
  {label: 'Total', flex: 1, right: true},
  {label: 'Available', flex: 1, right: true},
  {label: 'Price', flex: 1, right: true},
  {label: 'Value', flex: 1, right: true},
  {label: 'PnL', flex: 1, right: true},
];
const TRADES: Column[] = [
  {label: 'Time', flex: 1.2},
  {label: 'Coin', flex: 0.8, bold: true},
  {label: 'Direction', flex: 1.2},
  {label: 'Price', flex: 1, right: true},
  {label: 'Size', flex: 0.9, right: true},
  {label: 'Closed PnL', flex: 1.1, right: true},
];
const ORDERS: Column[] = [
  {label: 'Coin', flex: 0.9, bold: true},
  {label: 'Direction', flex: 0.9},
  {label: 'Size', flex: 1, right: true},
  {label: 'Price', flex: 1.2, right: true},
  {label: 'Type', flex: 1.6, right: true},
];
const EARN: Column[] = [
  {label: 'Coin', flex: 1, bold: true},
  {label: 'Supplied', flex: 1.3, right: true},
  {label: 'Borrowed', flex: 1.3, right: true},
];
const ACCOUNTS: Column[] = [
  {label: 'Account', flex: 1.2, bold: true},
  {label: 'Value', flex: 1.1, right: true},
  {label: 'Positions', flex: 0.8, right: true},
  {label: 'Closest liquidation', flex: 1.5, right: true},
];
const VAULTS: Column[] = [
  {label: 'Vault', flex: 1.5, bold: true},
  {label: 'Equity', flex: 1, right: true},
];

function Position({p, money}: {p: HlPosition; money: Money}) {
  const usd = (value: number | null) => fmtMoney(value, money);
  const signed = (value: number) => fmtSigned(value, money);
  return (
    <Box>
      <H2>{positionTitle(p)}</H2>
      <Pair a="PnL" av={signed(p.pnl)} b="ROE" bv={fmtChange(p.roe)} />
      <Pair a="Entry" av={usd(p.entry)} b="Mark" bv={usd(p.mark)} />
      <Pair
        a="Position value"
        av={usd(p.value)}
        b="Margin"
        bv={usd(p.margin)}
      />
      <Pair
        a="Liq. price"
        av={p.liquidation === null ? 'none' : usd(p.liquidation)}
        b="Distance"
        bv={pct(p.liquidationDistance)}
      />
      <Pair
        a="Funding so far"
        av={signed(p.funding)}
        b="Rate / hour"
        bv={pct(p.fundingRate, 4)}
      />
      <Pair
        a="Funding / day"
        av={p.fundingPerDay === null ? '-' : signed(-p.fundingPerDay)}
        b="Rate / year"
        bv={pct(p.fundingRate === null ? null : p.fundingRate * 24 * 365)}
      />
    </Box>
  );
}

/** Account value or PnL over a chosen period, from what the exchange keeps. */
function History({account}: {account: HlAccount}) {
  const [span, setSpan] = useState<Span>('week');
  const [what, setWhat] = useState<'values' | 'pnls'>('values');
  const values = account.periods[span]?.[what] ?? [];
  return (
    <>
      <Row>
        <Flex>
          <Btn
            label="Account value"
            selected={what === 'values'}
            onPress={() => setWhat('values')}
          />
        </Flex>
        <Flex>
          <Btn
            label="PnL"
            selected={what === 'pnls'}
            onPress={() => setWhat('pnls')}
          />
        </Flex>
      </Row>
      <Row>
        {SPANS.map(([key, label]) => (
          <Flex key={key}>
            <Btn
              label={label}
              selected={key === span}
              onPress={() => setSpan(key)}
            />
          </Flex>
        ))}
      </Row>
      <Chart values={values} />
      {values.length < 2 && <Small>No history read yet. Tap Refresh.</Small>}
    </>
  );
}

/** The trades read in this session, by account: kept so a copy can use them. */
export const hlFills = new Map<string, HlFill[]>();

/** The latest trades of an account, read only when asked for. */
function Trades({address, money}: {address: string; money: Money}) {
  const [, redraw] = useState(0);
  const [state, setState] = useState('');
  const fills = hlFills.get(address);
  const read = () => {
    setState('reading');
    fetchHlFills(address)
      .then(found => {
        hlFills.set(address, found);
        setState('');
        redraw(n => n + 1);
      })
      .catch(e => setState((e as Error).message));
  };
  const button = (
    <Btn
      label={
        state === 'reading'
          ? 'Reading...'
          : fills
          ? 'Read the trades again'
          : 'Read the last 20 trades'
      }
      disabled={state === 'reading'}
      onPress={read}
    />
  );
  const problem = state !== '' && state !== 'reading' && (
    <Small>Not read: {state}.</Small>
  );
  if (!fills) {
    return (
      <>
        {button}
        {problem}
        <Small>
          The trade history is asked from Hyperliquid only when you tap.
        </Small>
      </>
    );
  }
  const fees = fills
    .filter(fill => fill.feeCoin === 'USDC')
    .reduce((sum, fill) => sum + fill.fee, 0);
  return (
    <>
      {fills.length === 0 ? (
        <P>No trade.</P>
      ) : (
        <>
          <TableHead columns={TRADES} />
          {fills.map((fill, i) => (
            <TableRow
              key={i}
              columns={TRADES}
              cells={[
                fmtShortTime(fill.time),
                fill.coin,
                fill.direction,
                fmtMoney(fill.price, money),
                fmtNumber(fill.size),
                fill.closedPnl === 0 ? '-' : fmtSigned(fill.closedPnl, money),
              ]}
            />
          ))}
          <Small>
            The last {fills.length} trades. Fees paid on them:{' '}
            {fmtMoney(fees, money)}.
          </Small>
        </>
      )}
      {button}
      {problem}
    </>
  );
}

interface Props {
  /** Accounts with something in them, in the order of the wallets. */
  accounts: HlAccount[];
  names: Record<string, string>;
  /** Address of the account shown; null for all of them together. */
  current: string | null;
  onAccount: (address: string | null) => void;
  tab: HlTab;
  onTab: (tab: HlTab) => void;
  hasEvmWallet: boolean;
  /** Hyperliquid counts in dollars; this turns them into the display currency. */
  money: Money;
}

export function HyperliquidView(props: Props) {
  const {accounts, tab, money} = props;
  const usd = (value: number | null) => fmtMoney(value, money);
  const signed = (value: number) => fmtSigned(value, money);
  if (accounts.length === 0) {
    return (
      <P>
        {props.hasEvmWallet
          ? 'No Hyperliquid account found for your EVM addresses yet. Tap Refresh.'
          : 'Add the EVM address of your Hyperliquid account in Settings, Wallets: the account has the same address.'}
      </P>
    );
  }
  const picker = accounts.length > 1 && (
    <Row>
      <Flex>
        <Btn
          label="All"
          selected={props.current === null}
          onPress={() => props.onAccount(null)}
        />
      </Flex>
      {accounts.map(account => (
        <Flex key={account.address}>
          <Btn
            label={nameOf(props.names, account.address)}
            selected={account.address === props.current}
            onPress={() => props.onAccount(account.address)}
          />
        </Flex>
      ))}
    </Row>
  );
  const one = accounts.find(x => x.address === props.current);
  if (accounts.length > 1 && !one) {
    const value = (x: HlAccount) => x.accountValue ?? x.perps.accountValue;
    return (
      <>
        {picker}
        <Box>
          <Label>All accounts</Label>
          <H2>{usd(accounts.reduce((sum, x) => sum + value(x), 0))}</H2>
          <Small>
            {accounts.length} accounts. Tap one above for its detail.
          </Small>
        </Box>
        <TableHead columns={ACCOUNTS} />
        {accounts.map(x => (
          <TableRow
            key={x.address}
            columns={ACCOUNTS}
            onPress={() => props.onAccount(x.address)}
            cells={[
              nameOf(props.names, x.address),
              usd(value(x)),
              String(x.positions.length),
              x.positions[0]?.liquidationDistance != null
                ? `${x.positions[0].coin} ${pct(
                    x.positions[0].liquidationDistance,
                  )}`
                : '-',
            ]}
          />
        ))}
        <Small>
          Closest liquidation: the position nearest to it, and how far.
        </Small>
      </>
    );
  }
  const a = one ?? accounts[0];
  const spotValue = a.spot.reduce((sum, b) => sum + (b.value ?? 0), 0);
  const vaultValue = a.vaults.reduce((sum, v) => sum + v.equity, 0);
  return (
    <>
      {picker}
      {[0, 4].map(start => (
        <Row key={start}>
          {HL_TABS.slice(start, start + 4).map(([key, label]) => (
            <Flex key={key}>
              <Btn
                label={label}
                selected={key === tab}
                onPress={() => props.onTab(key)}
              />
            </Flex>
          ))}
        </Row>
      ))}
      {money.currency !== 'usd' && (
        <Small>
          Hyperliquid counts in dollars; shown in euros at $1 = €
          {money.rate.toFixed(4)}.
        </Small>
      )}
      {a.stale && (
        <Banner>
          The last read failed. These figures are of {fmtWhen(a.at)}.
        </Banner>
      )}
      {tab === 'summary' && (
        <>
          <Box>
            <Label>Account value</Label>
            <H2>{usd(a.accountValue)}</H2>
            <Small>
              {a.unified
                ? 'Unified account'
                : 'Separate spot and perp accounts'}
              {' · '}read {fmtWhen(a.at)}
            </Small>
          </Box>
          <Pair
            a="Spot"
            av={usd(spotValue)}
            b="Staking"
            bv={usd(a.staking.value)}
          />
          <Pair
            a="Perps equity"
            av={usd(a.perps.accountValue)}
            b="Vaults"
            bv={usd(vaultValue)}
          />
          <Pair
            a="Margin used"
            av={usd(a.perps.marginUsed)}
            b="Withdrawable"
            bv={usd(a.perps.withdrawable)}
          />
          <Pair
            a="Notional"
            av={usd(a.perps.notional)}
            b="Leverage"
            bv={
              a.perps.leverage === null
                ? '-'
                : `${a.perps.leverage.toFixed(2)}x`
            }
          />
          <Pair
            a="Margin ratio"
            av={pct(a.perps.marginRatio)}
            b="Open orders"
            bv={String(a.orders.length)}
          />
          {a.positions[0]?.liquidationDistance != null && (
            <Small>
              Closest liquidation: {a.positions[0].coin},{' '}
              {pct(a.positions[0].liquidationDistance)} away.
            </Small>
          )}
          <History account={a} />
          <TableHead columns={PERIODS} />
          {SPANS.map(([key, label]) => {
            const period = a.periods[key];
            return (
              <TableRow
                key={key}
                columns={PERIODS}
                cells={[
                  label,
                  signed(period.pnl),
                  usd(period.volume),
                  signed(period.perpPnl ?? 0),
                  usd(period.perpVolume ?? 0),
                ]}
              />
            );
          })}
        </>
      )}
      {tab === 'perps' &&
        (a.positions.length === 0 ? (
          <P>No open position.</P>
        ) : (
          <>
            <Small>
              Closest to liquidation first. Funding / day: + received, - paid.
            </Small>
            {a.positions.map(p => (
              <Position key={p.coin} p={p} money={money} />
            ))}
          </>
        ))}
      {tab === 'spot' &&
        (a.spot.length === 0 ? (
          <P>No spot balance.</P>
        ) : (
          <>
            <TableHead columns={SPOT} />
            {a.spot.map(b => (
              <TableRow
                key={b.coin}
                columns={SPOT}
                cells={[
                  b.coin,
                  fmtNumber(b.total),
                  fmtNumber(b.total - b.hold),
                  usd(b.price),
                  usd(b.value),
                  b.pnl === null ? '-' : signed(b.pnl),
                ]}
              />
            ))}
            <Small>
              Available: what is not held by an order or as margin. PnL: value
              now minus what the coins cost.
            </Small>
          </>
        ))}
      {tab === 'staking' && (
        <>
          <Box>
            <Label>HYPE in staking</Label>
            <H2>
              {fmtNumber(a.staking.total)} HYPE · {usd(a.staking.value)}
            </H2>
          </Box>
          <Pair
            a="Delegated"
            av={fmtNumber(a.staking.delegated)}
            b="Not delegated"
            bv={fmtNumber(a.staking.undelegated)}
          />
          <Pair
            a="Being withdrawn"
            av={fmtNumber(a.staking.pending)}
            b="Rewards so far"
            bv={fmtNumber(a.staking.rewards)}
          />
          <Small>Rewards are in HYPE, since the account started staking.</Small>
        </>
      )}
      {tab === 'earn' && (
        <>
          <Label>Supply and borrow</Label>
          {a.earn.length === 0 ? (
            <P>Nothing supplied or borrowed.</P>
          ) : (
            <>
              <TableHead columns={EARN} />
              {a.earn.map(e => (
                <TableRow
                  key={e.coin}
                  columns={EARN}
                  cells={[e.coin, fmtNumber(e.supplied), fmtNumber(e.borrowed)]}
                />
              ))}
              <Small>
                Health: {a.earnHealth || '-'}. These amounts are not added to
                the portfolio total.
              </Small>
            </>
          )}
          <Label>Vaults</Label>
          {a.vaults.length === 0 ? (
            <P>No vault deposit.</P>
          ) : (
            <>
              <TableHead columns={VAULTS} />
              {a.vaults.map(v => (
                <TableRow
                  key={v.address}
                  columns={VAULTS}
                  cells={[shortAddress(v.address), usd(v.equity)]}
                />
              ))}
            </>
          )}
        </>
      )}
      {tab === 'orders' &&
        (a.orders.length === 0 ? (
          <P>No open order.</P>
        ) : (
          <>
            <TableHead columns={ORDERS} />
            {a.orders.map((o, i) => (
              <TableRow
                key={i}
                columns={ORDERS}
                cells={[
                  o.coin,
                  o.buy ? 'Buy' : 'Sell',
                  fmtNumber(o.size),
                  usd(o.trigger ?? o.price),
                  o.type + (o.reduceOnly ? ', reduce' : ''),
                ]}
              />
            ))}
          </>
        ))}
      {tab === 'trades' && (
        <Trades key={a.address} address={a.address} money={money} />
      )}
    </>
  );
}
