import {
  HlMarket,
  hlParts,
  parseHlAccount,
  parseHlFills,
  spotPrice,
} from '../src/core/hyperliquid';
import {columns, hlText, portfolioText} from '../src/core/notes';
import {portfolioCols, shown} from '../src/core/columns';
import {Quote} from '../src/core/model';
import {buildPortfolio, coinIdsOf, usdRate} from '../src/core/portfolio';
import {Holding} from '../src/core/readers';
import {priceIdOf} from '../src/core/tokens';

const market: HlMarket = {
  mids: {'@142': '83000', '@151': '2500', HYPE: '85', NEAR: '5.33'},
  tokenNames: new Map([
    [0, 'USDC'],
    [150, 'HYPE'],
    [197, 'UBTC'],
    [221, 'UETH'],
  ]),
  pairKeys: new Map([
    [197, '@142'],
    [221, '@151'],
  ]),
  perps: new Map([['NEAR', {mark: 5.33, funding: 0.0000125}]]),
  dexes: [],
};

// Shapes copied from real answers of the info endpoint.
const raw = {
  mode: 'unifiedAccount',
  perps: {
    marginSummary: {
      accountValue: '107.69',
      totalNtlPos: '310.74',
      totalRawUsd: '-203.14',
      totalMarginUsed: '103.61',
    },
    crossMaintenanceMarginUsed: '15.54',
    withdrawable: '4.08',
    assetPositions: [
      {
        type: 'oneWay',
        position: {
          coin: 'NEAR',
          szi: '58.3',
          leverage: {type: 'cross', value: 3},
          entryPx: '5.2254',
          positionValue: '310.74',
          unrealizedPnl: '6.19',
          returnOnEquity: '0.061',
          liquidationPx: '2.665',
          marginUsed: '103.61',
          cumFunding: {allTime: '1.30', sinceOpen: '0.054', sinceChange: '0.054'},
        },
      },
    ],
  },
  spot: {
    balances: [
      {coin: 'USDC', token: 0, total: '2073.5', hold: '103.61', entryNtl: '0.0'},
      {coin: 'HYPE', token: 150, total: '0.0', hold: '0.0', entryNtl: '0.0'},
      {coin: 'UBTC', token: 197, total: '0.02', hold: '0.0', entryNtl: '1363.25'},
    ],
  },
  staking: {
    delegated: '10.0',
    undelegated: '46.0',
    totalPendingWithdrawal: '0.0',
    nPendingWithdrawals: 0,
  },
  rewards: [
    {time: 1, source: 'delegation', totalAmount: '0.5'},
    {time: 2, source: 'delegation', totalAmount: '0.25'},
  ],
  vaults: [
    {vaultAddress: '0xaaaa', equity: '0.000001'},
    {vaultAddress: '0xbbbb', equity: '250.5'},
  ],
  earn: {
    tokenToState: [[0, {borrow: {value: '0.0'}, supply: {value: '0.0'}}]],
    health: 'healthy',
  },
  orders: [
    {
      coin: 'NEAR',
      side: 'A',
      limitPx: '6.5',
      sz: '58.3',
      orderType: 'Take Profit Market',
      triggerPx: '6.4',
      isTrigger: true,
      reduceOnly: true,
    },
  ],
  portfolio: [
    ['day', {accountValueHistory: [[1, '10000'], [2, '10474.01']], pnlHistory: [[1, '0'], [2, '130.36']], vlm: '304.64'}],
    ['week', {accountValueHistory: [[2, '10474.01']], pnlHistory: [[2, '-489.36']], vlm: '13282.56'}],
    ['month', {accountValueHistory: [[2, '10474.01']], pnlHistory: [[2, '741.53']], vlm: '31654.29'}],
    ['allTime', {accountValueHistory: [[2, '10474.01']], pnlHistory: [[2, '1929.78']], vlm: '245083.59'}],
    ['perpDay', {accountValueHistory: [[2, '107.7']], pnlHistory: [[2, '6.04']], vlm: '304.64'}],
  ],
};

describe('a Hyperliquid account', () => {
  const account = parseHlAccount('0xabc', market, raw, 1000);

  it('takes its value from the exchange itself', () => {
    expect(account.accountValue).toBe(10474.01);
    expect(account.unified).toBe(true);
    expect(account.periods.week).toMatchObject({pnl: -489.36, volume: 13282.56});
    // The perp account alone, and the history kept for the chart.
    expect(account.periods.day).toMatchObject({perpPnl: 6.04, perpVolume: 304.64});
    expect(account.periods.day.values).toEqual([10000, 10474.01]);
    expect(account.periods.day.pnls).toEqual([0, 130.36]);
    expect(account.periods.allTime.pnl).toBe(1929.78);
  });

  it('describes a position, with its distance to liquidation and funding', () => {
    const [p] = account.positions;
    expect(p).toMatchObject({coin: 'NEAR', size: 58.3, leverage: 3, isolated: false, mark: 5.33});
    expect(p.roe).toBeCloseTo(6.1, 6);
    // (5.33 - 2.665) / 5.33
    expect(p.liquidationDistance).toBeCloseTo(50, 6);
    // Paid funding is reported positive by the exchange.
    expect(p.funding).toBeCloseTo(-0.054, 6);
    expect(p.fundingRate).toBeCloseTo(0.00125, 8);
    // A long pays when the rate is positive: 310.74 * 0.0000125 * 24.
    expect(p.fundingPerDay).toBeCloseTo(0.093222, 5);
    expect(account.perps.leverage).toBeCloseTo(310.74 / 107.69, 6);
    expect(account.perps.marginRatio).toBeCloseTo((15.54 / 107.69) * 100, 6);
  });

  it('prices spot tokens through their USDC pair, and drops empty ones', () => {
    expect(account.spot.map(b => [b.coin, b.value])).toEqual([
      ['USDC', 2073.5],
      ['UBTC', 1660],
    ]);
    expect(account.spot[0].pnl).toBeNull();
    expect(account.spot[1].pnl).toBeCloseTo(296.75, 6);
    // Deposited coins have no entry value: what they cost is unknown.
    const deposited = parseHlAccount(
      '0xabc',
      market,
      {...raw, spot: {balances: [{coin: 'UBTC', token: 197, total: '0.02', hold: '0', entryNtl: '0.0'}]}},
      1000,
    );
    expect(deposited.spot[0]).toMatchObject({value: 1660, pnl: null, cost: null});
    expect(spotPrice(market, 'XYZ', 999)).toBeNull();
  });

  it('adds up staking, rewards, vaults and orders', () => {
    expect(account.staking).toMatchObject({total: 56, value: 4760, rewards: 0.75});
    expect(account.vaults).toEqual([{address: '0xbbbb', equity: 250.5}]);
    expect(account.earn).toEqual([]);
    expect(account.orders[0]).toMatchObject({coin: 'NEAR', buy: false, trigger: 6.4, reduceOnly: true});
  });

  it('does not count the perp margin twice on a unified account', () => {
    expect(hlParts(account).map(p => [p.symbol, p.quantity, p.note])).toEqual([
      ['USDC', 2073.5, 'spot'],
      ['UBTC', 0.02, 'spot'],
      ['HYPE', 56, 'staked'],
      ['USDC', 250.5, 'vault'],
    ]);
    const separate = parseHlAccount('0xabc', market, {...raw, mode: 'default'}, 1000);
    expect(hlParts(separate).map(p => p.note)).toContain('perp account');
  });

  it('prices its tokens as the coins they stand for', () => {
    expect(hlParts(account).map(p => p.coinId)).toEqual([
      'usd-coin',
      'bitcoin',
      'hyperliquid',
      'usd-coin',
    ]);
  });

  it('writes a tab as text', () => {
    const text = hlText(account, 'perps', 'Main');
    expect(text.split('\n')[0]).toMatch(/^CRYPTOVIEW - HYPERLIQUID PERPS - MAIN - /);
    expect(text).toContain('NEAR LONG 58.30 - 3x cross');
    expect(text).toContain('50.0%');
    expect(hlText(account, 'summary', '')).toContain('ACCOUNT VALUE $10,474');
  });

  it('shows dollars in the display currency', () => {
    const text = hlText(account, 'summary', '', {currency: 'eur', rate: 0.5});
    expect(text).toContain('ACCOUNT VALUE €5,237');
    expect(text).not.toContain('$');
  });

  it('lists the latest trades, newest first, with the coin of a spot pair', () => {
    // Shapes copied from real answers of the info endpoint.
    const fills = parseHlFills(
      [
        {coin: 'JTO', px: '0.40146', sz: '604.0', side: 'A', time: 1000, dir: 'Close Long', closedPnl: '14.79196', fee: '0.109116', feeToken: 'USDC'},
        {coin: '@142', px: '83000', sz: '0.01', side: 'B', time: 3000, dir: 'Buy', closedPnl: '0.0', fee: '0.000004', feeToken: 'UBTC'},
        {coin: 'MEGA', px: '0.047177', sz: '1420.0', side: 'B', time: 2000, dir: 'Open Long', closedPnl: '0.0', fee: '0.0', feeToken: 'USDC'},
      ],
      {tokens: [{index: 197, name: 'UBTC'}, {index: 0, name: 'USDC'}], universe: [{name: '@142', tokens: [197, 0]}]},
      2,
    );
    expect(fills.map(f => [f.coin, f.direction])).toEqual([
      ['UBTC', 'Buy'],
      ['MEGA', 'Open Long'],
    ]);
    expect(fills[0].value).toBeCloseTo(830, 6);
    const text = hlText(account, 'trades', '', undefined, fills);
    expect(text).toContain('HYPERLIQUID TRADE HISTORY');
    expect(text).toContain('Open Long');
    expect(hlText(account, 'trades', '')).toContain('No trade read.');
  });

  it('adds the positions of the markets run by others', () => {
    const dex = {
      state: {
        marginSummary: {accountValue: '100', totalNtlPos: '300', totalMarginUsed: '30'},
        withdrawable: '70',
        assetPositions: [
          {
            position: {
              coin: 'xyz:TSLA',
              szi: '-1',
              positionValue: '300',
              entryPx: '310',
              unrealizedPnl: '10',
              returnOnEquity: '0.33',
              marginUsed: '30',
              leverage: {type: 'isolated', value: 10},
              liquidationPx: '330',
            },
          },
        ],
      },
      prices: [{universe: [{name: 'xyz:TSLA'}]}, [{markPx: '300', funding: '0.00001'}]],
      orders: [{coin: 'xyz:TSLA', side: 'B', sz: '1', limitPx: '280'}],
    };
    const plain = parseHlAccount('0xabc', market, raw, 1000);
    const both = parseHlAccount('0xabc', market, {...raw, dexes: [dex]}, 1000);
    expect(both.positions.length).toBe(plain.positions.length + 1);
    const tsla = both.positions.find(p => p.coin === 'xyz:TSLA')!;
    expect(tsla.mark).toBe(300);
    expect(tsla.liquidationDistance).toBeCloseTo(10);
    expect(tsla.fundingPerDay).toBeCloseTo(-300 * 0.00001 * 24);
    expect(both.perps.accountValue).toBeCloseTo(plain.perps.accountValue + 100);
    expect(both.perps.notional).toBeCloseTo(plain.perps.notional + 300);
    expect(both.orders.length).toBe(plain.orders.length + 1);
  });
});

const quote = (id: string, symbol: string, price: number): Quote =>
  ({id, symbol, name: id, rank: 1, price, changes: {h24: 0}} as Quote);
const holding = (over: Partial<Holding>): Holding => ({
  source: 's',
  wallet: '0x1',
  chain: 'Ethereum',
  symbol: 'ETH',
  name: 'ETH',
  quantity: 1,
  coinId: 'ethereum',
  ...over,
});

describe('the dollar', () => {
  const quotes = {'usd-coin': quote('usd-coin', 'USDC', 0.86), ethereum: quote('ethereum', 'ETH', 2000)};

  it('is worth 1 in dollars, and the price of USDC otherwise', () => {
    expect(usdRate('usd', {})).toBe(1);
    expect(usdRate('eur', quotes)).toBe(0.86);
    expect(usdRate('eur', {})).toBeNull();
  });

  it('counts USDC as exactly one dollar, on every chain', () => {
    expect(priceIdOf({symbol: 'USDC', coinId: 'usd-coin'})).toBe('usd-coin');
    expect(priceIdOf({symbol: 'USDC.e', coinId: 'usd-coin-ethereum-bridged'})).toBe('usd-coin');
    expect(priceIdOf({symbol: 'USDbC', coinId: 'bridged-usd-coin-base'})).toBe('usd-coin');
    // Anybody can issue a token and call it USDC.
    expect(priceIdOf({symbol: 'USDC', coinId: null})).toBeNull();
    expect(priceIdOf({symbol: 'USDC', coinId: 'something-else'})).toBe('something-else');
    expect(priceIdOf({symbol: 'LINK', coinId: null})).toBeNull();
    const inDollars = buildPortfolio(
      [holding({symbol: 'USDC', coinId: 'usd-coin', quantity: 100})],
      {'usd-coin': quote('usd-coin', 'USDC', 0.9997)},
      1,
    );
    expect(inDollars.total).toBe(100);
  });

  it('uses the chain price for a coin the price source does not know', () => {
    const portfolio = buildPortfolio(
      [holding({symbol: 'ODD', coinId: null, quantity: 10, usd: 3})],
      quotes,
      usdRate('eur', quotes),
    );
    expect(portfolio.total).toBeCloseTo(25.8, 6);
    expect(portfolio.unpriced).toEqual([]);
  });

  it('always asks for the price of USDC', () => {
    expect(coinIdsOf([holding({})])).toEqual(['usd-coin', 'ethereum']);
  });
});

describe('text for a note', () => {
  it('lines columns up', () => {
    expect(columns([['COIN', 'VALUE'], ['BTC', '12,999'], ['ETHEREUM', '4']])).toBe(
      'COIN       VALUE\nBTC       12,999\nETHEREUM       4',
    );
  });
  it('writes the portfolio with its total', () => {
    const portfolio = buildPortfolio(
      [holding({quantity: 1.5}), holding({symbol: 'XYZ', coinId: null, quantity: 7})],
      {ethereum: quote('ethereum', 'ETH', 2000)},
      1,
    );
    const quotes = {ethereum: quote('ethereum', 'ETH', 2000)};
    const all = portfolioCols({currency: 'eur', quotes, total: portfolio.total, names: {}});
    const at = new Date(2026, 9, 11, 9, 5).getTime();
    const text = portfolioText(portfolio, 'eur', at, shown(all, undefined));
    // Other columns picked: the note follows the screen.
    expect(portfolioText(portfolio, 'eur', at, shown(all, ['share', 'chains']))).toContain(
      'COIN  % TOTAL  CHAINS\nETH    100.0%       1',
    );
    expect(text.split('\n')[0]).toBe('CRYPTOVIEW - PORTFOLIO - 11 OCT 2026 09:05');
    expect(text).toContain('TOTAL €3,000');
    expect(text).toContain('ETH       1.50  €2,000  €3,000    -     -');
    expect(text).toContain('(same balances, prices only)');
    expect(text).toContain('No price: 7.00 XYZ');
  });
});
