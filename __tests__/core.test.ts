import {marketsUrl, parseQuote} from '../src/core/coingecko';
import {fmtChange, fmtLarge, fmtNumber, fmtPrice, fmtWhen} from '../src/core/format';
import {normalizeSettings} from '../src/core/model';
import {searchCoins} from '../src/core/search';

describe('format', () => {
  it('uses fewer decimals as the number grows', () => {
    expect(fmtNumber(74053.4)).toBe('74,053');
    expect(fmtNumber(1234567)).toBe('1,234,567');
    expect(fmtNumber(98.416)).toBe('98.42');
    expect(fmtNumber(0.202868)).toBe('0.2029');
    expect(fmtNumber(0.00001234)).toBe('0.00001234');
    expect(fmtNumber(0)).toBe('0');
    expect(fmtNumber(-12.5)).toBe('-12.50');
  });
  it('puts the currency sign first', () => {
    expect(fmtPrice(2237.45, 'eur')).toBe('€2,237');
    expect(fmtPrice(4.8, 'usd')).toBe('$4.80');
    expect(fmtPrice(null, 'usd')).toBe('-');
  });
  it('shortens large amounts', () => {
    expect(fmtLarge(1.474e12, 'usd')).toBe('$1.47T');
    expect(fmtLarge(269.8e9, 'eur')).toBe('€269.8B');
    expect(fmtLarge(950, 'eur')).toBe('€950');
  });
  it('marks the direction of a change', () => {
    expect(fmtChange(2.44)).toBe('▲ +2.4%');
    expect(fmtChange(-1.06)).toBe('▼ -1.1%');
    expect(fmtChange(0.01)).toBe('0.0%');
    expect(fmtChange(-0.04)).toBe('0.0%');
    expect(fmtChange(1234.5)).toBe('▲ +1,235%');
    expect(fmtChange(null)).toBe('-');
  });
  it('gives the time alone for today', () => {
    const now = new Date(2026, 9, 10, 22, 0).getTime();
    expect(fmtWhen(new Date(2026, 9, 10, 21, 42).getTime(), now)).toBe('21:42');
    expect(fmtWhen(new Date(2026, 9, 9, 8, 5).getTime(), now)).toBe('9 OCT 08:05');
    expect(fmtWhen(0, now)).toBe('NEVER');
  });
});

describe('coingecko', () => {
  it('reads a market row', () => {
    const quote = parseQuote({
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      market_cap_rank: 1,
      current_price: 74053,
      high_24h: 75000,
      low_24h: 73000,
      market_cap: 1.47e12,
      ath: 108000,
      ath_change_percentage: -31.4,
      price_change_percentage_24h: 0.9,
      price_change_percentage_7d_in_currency: -3.2,
      price_change_percentage_1y_in_currency: null,
    });
    expect(quote).toMatchObject({
      id: 'bitcoin',
      symbol: 'BTC',
      price: 74053,
      rank: 1,
      changes: {h24: 0.9, d7: -3.2, y1: null, h1: null},
    });
  });
  it('drops a row without a price', () => {
    expect(parseQuote({id: 'x', symbol: 'x', current_price: null})).toBeNull();
    expect(parseQuote(null)).toBeNull();
  });
  it('asks for every change in one request', () => {
    const url = marketsUrl(['bitcoin', 'fetch-ai'], 'eur');
    expect(url).toContain('vs_currency=eur');
    expect(url).toContain('ids=bitcoin,fetch-ai');
    expect(url).toContain('price_change_percentage=1h,24h,7d,14d,30d,200d,1y');
  });
});

describe('search', () => {
  const coins = [
    {id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2},
    {id: 'ethena', symbol: 'ENA', name: 'Ethena', rank: 40},
    {id: 'ethereum-classic', symbol: 'ETC', name: 'Ethereum Classic', rank: 30},
    {id: 'staked-ether', symbol: 'STETH', name: 'Lido Staked Ether', rank: 8},
    {id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: 1},
    {id: '1inch', symbol: '1INCH', name: '1inch', rank: 200},
  ];
  const ids = (typed: string) => searchCoins(coins, typed).map(c => c.id);
  it('puts the exact symbol first, then prefixes by size', () => {
    expect(ids('eth')).toEqual([
      'ethereum',
      'ethereum-classic',
      'ethena',
      'staked-ether',
    ]);
  });
  it('accepts digits and ignores case and spaces', () => {
    expect(ids(' 1IN ')).toEqual(['1inch']);
  });
  it('offers nothing for an empty field', () => {
    expect(ids('  ')).toEqual([]);
  });
});

describe('settings', () => {
  it('falls back to the defaults', () => {
    const settings = normalizeSettings(null);
    expect(settings.currency).toBe('eur');
    expect(settings.favorites[0]).toBe('bitcoin');
  });
  it('keeps valid values and drops duplicates', () => {
    expect(
      normalizeSettings({currency: 'usd', favorites: ['a', 'b', 'a', 3]}),
    ).toEqual({
      currency: 'usd',
      favorites: ['a', 'b'],
      tokens: {},
      skipped: [],
      dust: 1,
      hidden: [],
      costs: {},
      offered: [],
      columns: {},
      manual: [],
      converter: ['bitcoin', 'ethereum'],
    });
  });
});

describe('prices paid file', () => {
  const {costsFileText, parseCostsFile} = require('../src/core/costs');
  const {buildPortfolio, costKey} = require('../src/core/portfolio');
  const {decimalText} = require('../src/core/format');
  const held = {
    source: 'ethereum:0xabc',
    wallet: '0xabc',
    chain: 'Ethereum',
    symbol: 'LINK',
    name: 'Chainlink',
    quantity: 3,
    coinId: null,
  };
  it('writes every holding and reads back the prices typed', () => {
    const other = {...held, source: 'base:0xabc', chain: 'Base'};
    const costs = {
      [costKey(held)]: {price: 0, currency: 'eur'},
      gone: {price: 2.5, currency: 'usd'},
    };
    const text = costsFileText(buildPortfolio([held, other], {}), costs, {'0xabc': 'Main'});
    expect(text).toContain('LINK, Ethereum, Main, 0, eur, ethereum:0xabc|LINK|');
    expect(text).toContain('LINK, Base, Main, , , base:0xabc|LINK|');
    expect(parseCostsFile(text)).toEqual({costs, problems: []});
  });
  it('refuses a price it cannot read rather than guess', () => {
    const parsed = parseCostsFile('LINK, Base, Main, 1,5, eur, k\nA, B, C, 2, gbp, k2');
    expect(parsed.costs).toEqual({});
    expect(parsed.problems).toHaveLength(2);
  });
  it('turns what is typed into a number with one point', () => {
    expect(['0,25', '1.2.3', 'a12 €', ',5'].map(decimalText)).toEqual([
      '0.25',
      '1.23',
      '12',
      '.5',
    ]);
  });
});

describe('tools', () => {
  const {averageCost, convert, leveraged, plain, unitsOf} = require('../src/core/tools');
  const quotes = {
    bitcoin: {symbol: 'BTC', price: 50000},
    'usd-coin': {symbol: 'USDC', price: 0.86},
  };
  it('counts an amount in every unit, USDC as one dollar', () => {
    const units = unitsOf(['bitcoin', 'usd-coin', 'unknown'], quotes, 1, 0.8);
    expect(units.map((u: {label: string}) => u.label)).toEqual(['EUR', 'USD', 'BTC', 'USDC']);
    const [eur, usd, btc, usdc] = units;
    expect(convert(500, eur, usd)).toBeCloseTo(625, 6);
    expect(convert(500, eur, btc)).toBeCloseTo(0.01, 9);
    expect(convert(1, usdc, usd)).toBe(1);
    expect(plain(12345.678)).toBe('12346');
    // A currency whose rate is unknown is not offered.
    expect(unitsOf([], quotes, null, 1).map((u: {key: string}) => u.key)).toEqual(['usd']);
  });
  it('averages buys, a free one included', () => {
    expect(
      averageCost([
        {quantity: 1, price: 10},
        {quantity: 1, price: 0},
      ]),
    ).toEqual({quantity: 2, spent: 10, average: 5});
    expect(averageCost([])).toBeNull();
  });
  it('places the liquidation price of an isolated position', () => {
    const long = leveraged({entry: 100, margin: 50, leverage: 10, maxLeverage: 50, long: true});
    // 10% of margin, 1% to keep: 9% of room, over 0.99.
    expect(long.size).toBe(500);
    expect(long.liquidation).toBeCloseTo(100 - 9 / 0.99, 6);
    const short = leveraged({entry: 100, margin: 50, leverage: 10, maxLeverage: 50, long: false});
    expect(short.liquidation).toBeCloseTo(100 + 9 / 1.01, 6);
    const flat = leveraged({entry: 100, margin: 50, leverage: 1, maxLeverage: 50, long: true});
    expect(flat.liquidation).toBeNull();
    expect(leveraged({entry: 100, margin: 50, leverage: 60, maxLeverage: 50, long: true})).toBeNull();
  });
});

