/**
 * What "Copy to note" writes: the figures of a view as plain text, dated,
 * in columns that line up in a fixed-width font.
 */
import {
  DOLLARS,
  fmtChange,
  fmtDate,
  fmtWhen,
  fmtGain,
  fmtLarge,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtShortTime,
  fmtSigned,
  Money,
} from './format';
import {Col, MarketRow, tableText} from './columns';
import {GroupChain, GroupRow, WalletGroup} from './groups';
import {HlAccount, HlFill, positionTitle} from './hyperliquid';
import {Currency, Quote} from './model';
import {Article} from './news';
import {Line, Part, Portfolio} from './portfolio';
import {shortAddress} from './wallets';

/** Rows as aligned columns: the first to the left, the others to the right. */
export function columns(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map(row =>
      row
        .map((cell, i) =>
          i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]),
        )
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

const head = (title: string, at: number): string =>
  `CRYPTOVIEW - ${title} - ${fmtDate(at)}`;

const pct = fmtPct;

export function portfolioText(
  portfolio: Portfolio,
  currency: Currency,
  at: number,
  /** The columns shown on screen; see portfolioCols. */
  cols: Col<Line>[],
): string {
  const rows = tableText(cols, portfolio.lines);
  const dust = portfolio.dust.reduce((sum, line) => sum + line.value!, 0);
  if (portfolio.dust.length > 0) {
    const said: Record<string, string> = {
      coin: 'Dust',
      quantity: `${portfolio.dust.length} coins`,
      value: fmtPrice(dust, currency),
    };
    rows.push(cols.map(col => said[col.key] ?? ''));
  }
  return [
    head('PORTFOLIO', at),
    `TOTAL ${fmtPrice(portfolio.total, currency)}` +
      (portfolio.stale ? '   (partial read)' : ''),
    ...(portfolio.pnl === null
      ? []
      : [
          `PNL ${fmtGain(portfolio.pnl, portfolio.paid, currency)}` +
            (portfolio.pnlPartial ? ' ~' : ''),
        ]),
    `24H ${fmtChange(portfolio.change24h)}   7D ${fmtChange(
      portfolio.change7d,
    )}` +
      `   30D ${fmtChange(portfolio.change30d)}   (same balances, prices only)`,
    '',
    columns(rows),
    ...(portfolio.unpriced.length > 0
      ? [
          '',
          `No price: ${portfolio.unpriced
            .map(l => `${fmtNumber(l.quantity)} ${l.symbol}`)
            .join(', ')}`,
        ]
      : []),
  ].join('\n');
}

export function marketText(
  /** The favorites the price source knows, as the screen lists them. */
  rows: MarketRow[],
  at: number,
  cols: Col<MarketRow>[],
): string {
  return [
    head('MARKET', at),
    '',
    columns(
      tableText(
        cols,
        rows.filter(row => row.quote),
      ),
    ),
  ].join('\n');
}

export function coinText(quote: Quote, currency: Currency, at: number): string {
  const c = quote.changes;
  return [
    head(`${quote.symbol} ${quote.name}`.toUpperCase(), at),
    `PRICE ${fmtPrice(quote.price, currency)}`,
    '',
    columns([
      ['1 hour', fmtChange(c.h1)],
      ['24 hours', fmtChange(c.h24)],
      ['7 days', fmtChange(c.d7)],
      ['14 days', fmtChange(c.d14)],
      ['30 days', fmtChange(c.d30)],
      ['200 days', fmtChange(c.d200)],
      ['1 year', fmtChange(c.y1)],
      ['24h high', fmtPrice(quote.high24h, currency)],
      ['24h low', fmtPrice(quote.low24h, currency)],
      ['Market cap', fmtLarge(quote.marketCap, currency)],
      ['All-time high', fmtPrice(quote.ath, currency)],
      ['From all-time high', fmtChange(quote.athChange)],
    ]),
  ].join('\n');
}

export function assetText(
  line: Line,
  currency: Currency,
  at: number,
  cols: Col<Part>[],
): string {
  const rows = tableText(cols, line.parts);
  return [
    head(line.symbol.toUpperCase(), at),
    `${fmtNumber(line.quantity)} ${line.symbol} at ${fmtPrice(
      line.price,
      currency,
    )}` +
      ` = ${fmtPrice(line.value, currency)}   24H ${fmtChange(line.change24h)}`,
    '',
    columns(rows),
  ].join('\n');
}

/** One wallet as it is unfolded on screen: `open` names the chains shown in full. */
export function walletText(
  group: WalletGroup,
  open: (chain: GroupChain) => boolean,
  currency: Currency,
  at: number,
  /** The columns shown on screen for the chains of a wallet and their coins. */
  tables: {
    chains: (group: WalletGroup) => Col<GroupChain>[];
    coins: (chain: GroupChain) => Col<GroupRow>[];
  },
): string {
  const out = [
    head(`WALLET ${group.name}`.toUpperCase(), at),
    `VALUE ${fmtPrice(group.value, currency)}` +
      (group.share === null
        ? ''
        : `   ${group.share.toFixed(1)}% OF THE TOTAL`),
    '',
  ];
  const chainCols = tables.chains(group);
  const [titles, ...chains] = tableText(chainCols, group.chains);
  group.chains.forEach((chain, i) => {
    // Each chain says its own figures: a table of chains would be cut in
    // pieces by the coins unfolded under them.
    out.push(
      chains[i]
        .map((cell, column) =>
          column === 0 ? cell.toUpperCase() : `${titles[column]} ${cell}`,
        )
        .join('  '),
    );
    if (open(chain)) {
      out.push(columns(tableText(tables.coins(chain), chain.rows)), '');
    }
  });
  return out.join('\n').trimEnd();
}

/** Hyperliquid counts in dollars; `money` turns them into the display currency. */
export function hlText(
  account: HlAccount,
  tab: string,
  name: string,
  money: Money = DOLLARS,
  /** The trades read for this account, for the trade history. */
  fills?: HlFill[],
): string {
  const a = account;
  const usd = (value: number | null) => fmtMoney(value, money);
  const signed = (value: number) => fmtSigned(value, money);
  const title = (what: string) =>
    head(`HYPERLIQUID ${what}${name ? ` - ${name}` : ''}`.toUpperCase(), a.at);
  if (tab === 'perps') {
    if (a.positions.length === 0) {
      return [title('perps'), 'No open position.'].join('\n');
    }
    return [
      title('perps'),
      ...a.positions.flatMap(p => [
        '',
        positionTitle(p, '-'),
        columns([
          ['PnL', signed(p.pnl), '   ROE', fmtChange(p.roe)],
          ['Entry', usd(p.entry), '   Mark', usd(p.mark)],
          ['Position value', usd(p.value), '   Margin', usd(p.margin)],
          [
            'Liq. price',
            p.liquidation === null ? 'none' : usd(p.liquidation),
            '   Distance',
            pct(p.liquidationDistance),
          ],
          [
            'Funding so far',
            signed(p.funding),
            '   Funding/day',
            p.fundingPerDay === null ? '-' : signed(-p.fundingPerDay),
          ],
        ]),
      ]),
    ].join('\n');
  }
  if (tab === 'spot') {
    return [
      title('spot'),
      '',
      columns([
        ['COIN', 'TOTAL', 'AVAILABLE', 'PRICE', 'VALUE', 'PNL'],
        ...a.spot.map(b => [
          b.coin,
          fmtNumber(b.total),
          fmtNumber(b.total - b.hold),
          usd(b.price),
          usd(b.value),
          b.pnl === null ? '-' : signed(b.pnl),
        ]),
      ]),
    ].join('\n');
  }
  if (tab === 'staking') {
    return [
      title('staking'),
      `${fmtNumber(a.staking.total)} HYPE = ${usd(a.staking.value)}`,
      '',
      columns([
        ['Delegated', fmtNumber(a.staking.delegated)],
        ['Not delegated', fmtNumber(a.staking.undelegated)],
        ['Being withdrawn', fmtNumber(a.staking.pending)],
        ['Rewards so far', fmtNumber(a.staking.rewards)],
      ]),
    ].join('\n');
  }
  if (tab === 'earn') {
    return [
      title('earn'),
      '',
      a.earn.length === 0
        ? 'Nothing supplied or borrowed.'
        : columns([
            ['COIN', 'SUPPLIED', 'BORROWED'],
            ...a.earn.map(e => [
              e.coin,
              fmtNumber(e.supplied),
              fmtNumber(e.borrowed),
            ]),
          ]),
      ...(a.vaults.length > 0
        ? [
            '',
            columns([
              ['VAULT', 'EQUITY'],
              ...a.vaults.map(v => [shortAddress(v.address), usd(v.equity)]),
            ]),
          ]
        : []),
    ].join('\n');
  }
  if (tab === 'orders') {
    return [
      title('open orders'),
      '',
      a.orders.length === 0
        ? 'No open order.'
        : columns([
            ['COIN', 'DIRECTION', 'SIZE', 'PRICE', 'TYPE'],
            ...a.orders.map(o => [
              o.coin,
              o.buy ? 'Buy' : 'Sell',
              fmtNumber(o.size),
              usd(o.trigger ?? o.price),
              o.type + (o.reduceOnly ? ', reduce' : ''),
            ]),
          ]),
    ].join('\n');
  }
  if (tab === 'trades') {
    return [
      title('trade history'),
      '',
      !fills || fills.length === 0
        ? 'No trade read.'
        : columns([
            [
              'TIME',
              'COIN',
              'DIRECTION',
              'PRICE',
              'SIZE',
              'TRADE VALUE',
              'FEE',
              'CLOSED PNL',
            ],
            ...fills.map(f => [
              fmtShortTime(f.time),
              f.coin,
              f.direction,
              usd(f.price),
              fmtNumber(f.size),
              usd(f.value),
              f.feeCoin === 'USDC'
                ? usd(f.fee)
                : `${fmtNumber(f.fee)} ${f.feeCoin}`,
              f.closedPnl === 0 ? '-' : signed(f.closedPnl),
            ]),
          ]),
    ].join('\n');
  }
  const spot = a.spot.reduce((sum, b) => sum + (b.value ?? 0), 0);
  const vaults = a.vaults.reduce((sum, v) => sum + v.equity, 0);
  return [
    title('account'),
    `ACCOUNT VALUE ${usd(a.accountValue)}`,
    '',
    columns([
      ['Spot', usd(spot), '   Staking', usd(a.staking.value)],
      ['Perps equity', usd(a.perps.accountValue), '   Vaults', usd(vaults)],
      [
        'Margin used',
        usd(a.perps.marginUsed),
        '   Withdrawable',
        usd(a.perps.withdrawable),
      ],
      [
        'Notional',
        usd(a.perps.notional),
        '   Leverage',
        a.perps.leverage === null ? '-' : `${a.perps.leverage.toFixed(2)}x`,
      ],
    ]),
    '',
    columns([
      ['PERIOD', 'PNL', 'VOLUME'],
      ['24 hours', signed(a.periods.day.pnl), usd(a.periods.day.volume)],
      ['7 days', signed(a.periods.week.pnl), usd(a.periods.week.volume)],
      ['30 days', signed(a.periods.month.pnl), usd(a.periods.month.volume)],
      [
        'All time',
        signed(a.periods.allTime.pnl),
        usd(a.periods.allTime.volume),
      ],
    ]),
  ].join('\n');
}

/** The titles of a feed, newest first, each with its time. */
export function newsText(
  feed: string,
  articles: Article[],
  at: number,
): string {
  return [
    head(`NEWS - ${feed.toUpperCase()}`, at),
    '',
    ...articles.map(article => `${fmtWhen(article.at)}  ${article.title}`),
  ].join('\n');
}

/** One article: its title, when and where, its summary and its address. */
export function articleText(feed: string, article: Article): string {
  return [
    article.title,
    `${feed} - ${fmtDate(article.at)}`,
    '',
    article.summary,
    '',
    article.link,
  ].join('\n');
}
