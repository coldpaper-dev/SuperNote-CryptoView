/**
 * Balances typed by hand: read from their file, priced like the others,
 * and shown in the wallet of the same name, on their chain or off-chain.
 */
import {buildGroups} from '../src/core/groups';
import {
  manualFileText,
  manualHoldings,
  ManualAccount,
  parseManualFile,
  plainQuantity,
  setManual,
} from '../src/core/manual';
import {Coin, Quote} from '../src/core/model';
import {buildPortfolio, costKey} from '../src/core/portfolio';
import {Wallet} from '../src/core/wallets';

const coins: Coin[] = [
  {id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: 1},
  {id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2},
  {id: 'near', symbol: 'NEAR', name: 'NEAR Protocol', rank: 30},
  {id: 'other-eth', symbol: 'ETH', name: 'Other', rank: 900},
];
const quote = (id: string, symbol: string, price: number): Quote =>
  ({id, symbol, name: id, rank: 1, price, changes: {}} as Quote);

describe('typed balances', () => {
  it('reads the file, the largest coin first for a shared symbol', () => {
    const text =
      '# a comment\nKraken, Off-chain, btc, 0.5\n' +
      'Main, Arbitrum, ETH, 2, Aave\nBank, off-chain, EUR, 1500\n';
    const parsed = parseManualFile(text, coins, 7);
    expect(parsed.problems).toEqual([]);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.accounts).toEqual([
      {
        name: 'Kraken',
        at: 7,
        holdings: [
          {
            coin: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: 0.5,
            chain: 'Off-chain',
          },
        ],
      },
      {
        name: 'Main',
        at: 7,
        holdings: [
          {
            coin: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: 2,
            chain: 'Arbitrum',
            note: 'Aave',
          },
        ],
      },
      {
        name: 'Bank',
        at: 7,
        holdings: [
          {
            coin: 'cash:eur',
            symbol: 'EUR',
            name: 'Euro',
            quantity: 1500,
            chain: 'Off-chain',
          },
        ],
      },
    ]);
    // Written back, a shared symbol becomes the id, so it reads the same.
    const again = parseManualFile(
      manualFileText(parsed.accounts, coins),
      coins,
      7,
    );
    expect(again.accounts).toEqual(parsed.accounts);
    expect(again.notes).toEqual([]);
  });
  it('reads the file of earlier versions as off-chain', () => {
    const parsed = parseManualFile(
      'Kraken, NEAR, 10\nKraken, BTC, 1, Earn',
      coins,
    );
    expect(parsed.problems).toEqual([]);
    expect(
      parsed.accounts[0].holdings.map(h => [h.coin, h.chain, h.note]),
    ).toEqual([
      ['near', 'Off-chain', undefined],
      ['bitcoin', 'Off-chain', 'Earn'],
    ]);
  });
  it('writes quantities that it reads back, never as 1e-7', () => {
    expect(plainQuantity(1e-7)).toBe('0.0000001');
    expect(plainQuantity(1.5e-7)).toBe('0.00000015');
    expect(plainQuantity(2.5e21)).toBe('2500000000000000000000');
    expect(plainQuantity(0.25)).toBe('0.25');
    const accounts: ManualAccount[] = [
      {
        name: 'Kraken',
        at: 0,
        holdings: [
          {coin: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: 1e-7},
        ],
      },
    ];
    const parsed = parseManualFile(manualFileText(accounts, coins), coins);
    expect(parsed.problems).toEqual([]);
    expect(parsed.accounts[0].holdings[0].quantity).toBe(1e-7);
    // Written by hand, the short form is taken too.
    expect(
      parseManualFile('A, Off-chain, BTC, 2e-3', coins).accounts[0].holdings[0]
        .quantity,
    ).toBe(0.002);
  });
  it('tells wallet names apart regardless of case', () => {
    const parsed = parseManualFile(
      'kraken, Off-chain, BTC, 1\nKRAKEN, Off-chain, ETH, 2',
      coins,
      0,
      ['Kraken'],
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.accounts.map(a => [a.name, a.holdings.length])).toEqual([
      ['Kraken', 2],
    ]);
  });
  it('refuses what it cannot read rather than guess', () => {
    const parsed = parseManualFile(
      'A, Off-chain, BTC, 1,5\nA, Off-chain, XYZ, 1\nA, BTC\n' +
        'A, Off-chain, BTC, -1\nA, Base, EUR, 5',
      coins,
    );
    expect(parsed.accounts.flatMap(a => a.holdings)).toEqual([]);
    expect(parsed.problems).toHaveLength(5);
  });
  it('values coins and cash, in the wallet of the same name', () => {
    const accounts: ManualAccount[] = [
      {
        name: 'Main',
        at: 1,
        holdings: [
          {coin: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: 0.5},
          {
            coin: 'ethereum',
            symbol: 'ETH',
            name: 'Ethereum',
            quantity: 1,
            chain: 'Base',
          },
          {coin: 'cash:eur', symbol: 'EUR', name: 'Euro', quantity: 100},
          {coin: 'cash:usd', symbol: 'USD', name: 'US dollar', quantity: 50},
        ],
      },
    ];
    const holdings = manualHoldings(accounts, 0.8);
    const quotes = {
      bitcoin: quote('bitcoin', 'BTC', 40000),
      ethereum: quote('ethereum', 'ETH', 2000),
    };
    const costs = {
      [costKey(holdings[0])]: {price: 30000, currency: 'eur' as const},
      [costKey(holdings[1])]: {price: 1000, currency: 'eur' as const},
    };
    // Prices in euros: a dollar is 0.8 euro.
    const portfolio = buildPortfolio(holdings, quotes, 0.8, {
      costs,
      currency: 'eur',
      usdEur: 0.8,
    });
    expect(portfolio.total).toBeCloseTo(20000 + 2000 + 100 + 40, 6);
    expect(portfolio.pnl).toBeCloseTo(6000, 6);
    expect(portfolio.pnlPartial).toBe(false);
    const wallets = [
      {family: 'evm', address: '0xabc', name: 'Main'},
    ] as Wallet[];
    const groups = buildGroups(wallets, portfolio, 1, accounts);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.addresses).toHaveLength(1);
    expect(group.manual).toEqual({at: 1});
    expect(group.chains.map(c => c.chain).sort()).toEqual([
      'Base',
      'Off-chain',
    ]);
    expect(group.value).toBeCloseTo(22140, 6);
    expect(group.pnlPartial).toBe(false);
  });
  it('sets, adds and removes a balance, a coin per chain', () => {
    const added = setManual([], 'A', coins[0], 'Off-chain', 1, 5);
    expect(added).toEqual([
      {
        name: 'A',
        at: 5,
        holdings: [
          {
            coin: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            quantity: 1,
            chain: 'Off-chain',
          },
        ],
      },
    ]);
    const two = setManual(added, 'A', coins[0], 'Base', 3, 6);
    expect(two[0].holdings.map(h => [h.chain, h.quantity])).toEqual([
      ['Off-chain', 1],
      ['Base', 3],
    ]);
    expect(
      setManual(two, 'A', coins[0], 'Base', null, 7)[0].holdings,
    ).toHaveLength(1);
    // Cash is always off-chain, whatever was asked.
    const cash = setManual(
      [],
      'A',
      {id: 'cash:usd', symbol: 'USD', name: 'US dollar', rank: 0},
      'Base',
      9,
    );
    expect(cash[0].holdings[0].chain).toBe('Off-chain');
  });
});
