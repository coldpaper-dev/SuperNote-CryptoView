import {downsample} from '../src/core/coingecko';
import {toQuantity} from '../src/core/http';
import {Quote} from '../src/core/model';
import {TOKEN_CHAINS} from '../src/core/chains';
import {buildPortfolio, coinIdsOf, costKey} from '../src/core/portfolio';
import {
  base64Json,
  decodeBalances,
  encodeBalances,
  Holding,
  readAll,
  sourcesFor,
} from '../src/core/readers';
import {
  fillPriceIds,
  mirrorsNative,
  parseContractIds,
  searchTokens,
  withPriceId,
} from '../src/core/tokens';
import {fmtGain, fmtSignedPct} from '../src/core/format';
import {buildGroups} from '../src/core/groups';
import {darkRuns, qrMatrix} from '../src/core/qr';
import {HELP_URL, TIPS} from '../src/core/support';
import {sortBy} from '../src/core/sort';
import {walletText} from '../src/core/notes';
import {chainCols, coinCols, shown} from '../src/core/columns';
import {
  dropFromWalletsFile,
  familiesOf,
  fitsFamily,
  looksSecret,
  parseWallets,
  syncWalletsFile,
  walletKey,
} from '../src/core/wallets';

const EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

describe('amounts', () => {
  it('scales base units without losing digits', () => {
    expect(toQuantity('5768184715803065000', 18)).toBeCloseTo(5.768184715803065, 12);
    expect(toQuantity(37192124n, 6)).toBe(37.192124);
    expect(toQuantity('5', 8)).toBe(0.00000005);
    expect(toQuantity('1234', 0)).toBe(1234);
    expect(toQuantity('0', 18)).toBe(0);
  });
  it('encodes call arguments as base64', () => {
    for (const value of [{account_id: 'a.near'}, {account_id: 'ab.near'}, {a: 'abc'}]) {
      expect(base64Json(value)).toBe(
        Buffer.from(JSON.stringify(value)).toString('base64'),
      );
    }
  });
  it('fits a long history into a few columns', () => {
    const points = Array.from({length: 100}, (_, i) => [i, i] as [number, number]);
    const values = downsample(points, 10);
    expect(values).toHaveLength(10);
    expect(values[0]).toBe(4.5);
    expect(values[9]).toBe(94.5);
    expect(downsample(points.slice(0, 3), 10)).toEqual([0, 1, 2]);
  });
});

describe('addresses', () => {
  it('recognises the chain of an address', () => {
    expect(familiesOf(EVM)).toEqual(['evm']);
    expect(familiesOf('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh')).toEqual(['bitcoin']);
    expect(familiesOf('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr')).toEqual(['bitcoin']);
    expect(familiesOf('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toContain('bitcoin');
    expect(familiesOf('vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg')).toEqual(['solana']);
    expect(familiesOf('alice.near')).toEqual(['near']);
    expect(familiesOf('inj1cr8te4kr609gcawutmrza0j4xv80jy8zdunxjf')).toEqual(['injective']);
    expect(familiesOf('osmo1cr8te4kr609gcawutmrza0j4xv80jy8z0whjkr')).toEqual(['osmosis']);
    expect(familiesOf('hello')).toEqual([]);
  });
  it('says when a short address fits two chains', () => {
    expect(familiesOf('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toEqual(['bitcoin', 'solana']);
  });
  it('refuses what looks like a secret', () => {
    expect(looksSecret('abandon '.repeat(11) + 'about')).toBe(true);
    expect(looksSecret('xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi')).toBe(true);
    expect(looksSecret('0x' + 'ab'.repeat(32))).toBe(true);
    expect(looksSecret(EVM)).toBe(false);
    expect(looksSecret('ab'.repeat(32))).toBe(false);
  });
  it('reads the file of addresses', () => {
    const parsed = parseWallets(
      [
        '# my addresses',
        `${EVM}, Ledger`,
        `evm, ${EVM}, again`,
        'btc, 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa, Old',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'near, alice.near, Staking, a.poolv1.near b.poolv1.near',
        'sol, not-an-address',
        'abandon '.repeat(11) + 'about',
        '',
      ].join('\n'),
    );
    expect(parsed.wallets).toEqual([
      {family: 'evm', address: EVM, name: 'Ledger'},
      {family: 'bitcoin', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', name: 'Old'},
      {family: 'near', address: 'alice.near', name: 'Staking', pools: ['a.poolv1.near', 'b.poolv1.near']},
    ]);
    expect(parsed.problems).toEqual([
      'line 5: could be bitcoin or solana, name the chain first',
      'line 7: not a solana address',
      'line 8: looks like a secret, ignored',
    ]);
  });
});

describe('tokens', () => {
  it('finds a token by symbol, name or contract', () => {
    const list: [string, string, string, number][] = [
      ['0xaa', 'USDC+', 'Overnight USDC+', 6],
      ['0xbb', 'USDC', 'USD Coin', 6],
      ['0xcc', 'DAI', 'Dai Stablecoin', 18],
    ];
    expect(searchTokens(list, 'usdc', 5).map(t => t[0])).toEqual(['0xbb', '0xaa']);
    expect(searchTokens(list, 'stable', 5).map(t => t[0])).toEqual(['0xcc']);
    expect(searchTokens(list, '0xCC', 5).map(t => t[0])).toEqual(['0xcc']);
  });
});

const holding = (over: Partial<Holding>): Holding => ({
  source: 's',
  wallet: EVM,
  chain: 'Ethereum',
  symbol: 'ETH',
  name: 'ETH',
  quantity: 1,
  coinId: 'ethereum',
  ...over,
});
const quote = (id: string, symbol: string, price: number, h24: number): Quote =>
  ({id, symbol, name: id, rank: 1, price, changes: {h24}} as Quote);

describe('portfolio', () => {
  const quotes = {
    ethereum: quote('ethereum', 'ETH', 2000, 100),
    'usd-coin': quote('usd-coin', 'USDC', 1, 0),
  };
  const portfolio = buildPortfolio(
    [
      holding({quantity: 1}),
      holding({chain: 'Base', quantity: 0.5, stale: true}),
      holding({symbol: 'USDC', coinId: 'usd-coin', quantity: 1000}),
      holding({symbol: 'USDC', coinId: 'usd-coin', quantity: 0.4, chain: 'Base'}),
      holding({symbol: 'XYZ', coinId: null, quantity: 7}),
      holding({symbol: 'DAI', coinId: 'dai', quantity: 3}),
    ],
    quotes,
  );
  it('adds a coin across chains and values it once', () => {
    expect(portfolio.lines.map(l => [l.symbol, l.quantity, l.value])).toEqual([
      ['ETH', 1.5, 3000],
      ['USDC', 1000.4, 1000.4],
    ]);
    expect(portfolio.total).toBeCloseTo(4000.4, 6);
    expect(portfolio.lines[0].parts.map(p => p.chain)).toEqual(['Ethereum', 'Base']);
  });
  it('derives the change of the total from each coin', () => {
    // ETH doubled: 3000 was 1500; USDC flat. 4000.4 against 2500.4.
    expect(portfolio.change24h).toBeCloseTo(59.99, 1);
  });
  it('sets apart what has no price, and marks stale amounts', () => {
    expect(portfolio.unpriced.map(l => l.symbol)).toEqual(['XYZ', 'DAI']);
    expect(portfolio.stale).toBe(true);
    expect(portfolio.lines[0].stale).toBe(true);
    expect(portfolio.lines[1].stale).toBe(false);
  });
  it('folds tiny values into dust but keeps them in the total', () => {
    const small = buildPortfolio([holding({quantity: 0.0001})], quotes);
    expect(small.lines).toEqual([]);
    expect(small.dust).toHaveLength(1);
    expect(small.total).toBeCloseTo(0.2, 6);
  });
  it('takes the dust threshold asked for', () => {
    const none = buildPortfolio([holding({quantity: 0.0001})], quotes, null, {dust: 0});
    expect(none.dust).toEqual([]);
    const high = buildPortfolio([holding({quantity: 1})], quotes, null, {dust: 5000});
    expect(high.lines).toEqual([]);
    expect(high.dust).toHaveLength(1);
  });
  it('leaves a hidden coin out of the total', () => {
    const hidden = buildPortfolio(
      [holding({quantity: 1}), holding({symbol: 'USDC', coinId: 'usd-coin', quantity: 10})],
      quotes,
      null,
      {hidden: ['usd-coin']},
    );
    expect(hidden.total).toBe(2000);
    expect(hidden.hidden.map(l => l.symbol)).toEqual(['USDC']);
    expect(hidden.lines.map(l => l.symbol)).toEqual(['ETH']);
  });
  it('puts a staked form on the line of its coin, at its own price', () => {
    const grouped = buildPortfolio(
      [
        holding({quantity: 1}),
        holding({symbol: 'WSTETH', coinId: 'wrapped-steth', quantity: 2}),
      ],
      {...quotes, 'wrapped-steth': quote('wrapped-steth', 'WSTETH', 2500, 0)},
    );
    expect(grouped.lines).toHaveLength(1);
    expect(grouped.lines[0].symbol).toBe('ETH');
    expect(grouped.lines[0].value).toBe(7000);
    // 2 wstETH at 2500 are worth 2.5 ETH at 2000.
    expect(grouped.lines[0].quantity).toBeCloseTo(3.5, 9);
    expect(coinIdsOf([holding({coinId: 'wrapped-steth'})])).toContain('ethereum');
    // Without the price of the coin itself, the form keeps its own line.
    const alone = buildPortfolio(
      [holding({symbol: 'WSTETH', coinId: 'wrapped-steth', quantity: 2})],
      {'wrapped-steth': quote('wrapped-steth', 'WSTETH', 2500, 0)},
    );
    expect(alone.lines[0].symbol).toBe('WSTETH');
  });
  it('gives the change over a week and a month with the same balances', () => {
    const q = {
      ethereum: {...quote('ethereum', 'ETH', 2000, 0), changes: {h24: 0, d7: 100, d30: -50}},
      'usd-coin': quote('usd-coin', 'USDC', 1, 0),
    } as unknown as Record<string, Quote>;
    const p = buildPortfolio(
      [holding({quantity: 1}), holding({symbol: 'USDC', coinId: 'usd-coin', quantity: 1000})],
      q,
    );
    // 3000 now; a week ago ETH was 1000 (2000 in all), a month ago 4000 (5000).
    expect(p.change7d).toBeCloseTo(50, 6);
    expect(p.change30d).toBeCloseTo(-40, 6);
  });
  it('works out the gain from the prices paid, in either currency', () => {
    const eth = holding({quantity: 2});
    const base = holding({chain: 'Base', source: 'b', quantity: 1});
    const p = buildPortfolio([eth, base], quotes, 0.5, {
      currency: 'eur',
      usdEur: 0.5,
      costs: {[costKey(eth)]: {price: 3000, currency: 'usd'}},
    });
    const line = p.lines[0];
    // 2 ETH bought at $3000 = 1500 EUR each, worth 2000 each now.
    expect(line.parts[0].unitCost).toBe(1500);
    expect(line.pnl).toBe(1000);
    expect(line.pnlPct).toBeCloseTo(33.33, 1);
    expect(line.pnlPartial).toBe(true);
    const none = buildPortfolio([eth], quotes).lines[0];
    expect([none.pnl, none.pnlPct, none.pnlPartial]).toEqual([null, null, false]);
  });
  it('adds up the gain of the whole portfolio, a free coin included', () => {
    const eth = holding({quantity: 2});
    const free = holding({chain: 'Base', source: 'b', quantity: 1});
    const p = buildPortfolio([eth, free], quotes, 1, {
      currency: 'usd',
      costs: {
        [costKey(eth)]: {price: 1000, currency: 'usd'},
        [costKey(free)]: {price: 0, currency: 'usd'},
      },
    });
    // 3 ETH worth 2000 each; 2000 paid in all, the third one cost nothing.
    expect(p.lines[0].parts.map(part => part.pnl).sort()).toEqual([2000, 2000]);
    expect([p.pnl, p.paid, p.pnlPartial]).toEqual([4000, 2000, false]);
    const alone = buildPortfolio([free], quotes, 1, {
      currency: 'usd',
      costs: {[costKey(free)]: {price: 0, currency: 'usd'}},
    });
    // Nothing paid: a gain, but no percentage to give.
    expect([alone.lines[0].pnl, alone.lines[0].pnlPct]).toEqual([2000, null]);
    expect(buildPortfolio([eth], quotes, 1).pnl).toBeNull();
  });
  it('takes the price paid from the exchange unless the user typed one', () => {
    const spot = holding({chain: 'Hyperliquid', note: 'spot', quantity: 1, cost: 1000});
    expect(buildPortfolio([spot], quotes, 1).lines[0].pnl).toBe(1000);
    const typed = buildPortfolio([spot], quotes, 1, {
      costs: {[costKey(spot)]: {price: 1500, currency: 'usd'}},
      currency: 'usd',
    });
    expect(typed.lines[0].pnl).toBe(500);
  });
  it('keeps the price paid of two holdings alike apart', () => {
    const vault = holding({chain: 'Hyperliquid', note: 'vault', quantity: 1});
    const parts = buildPortfolio([vault, {...vault}], quotes, 1, {
      costs: {[costKey(vault)]: {price: 1500, currency: 'usd'}},
      currency: 'usd',
    }).lines[0].parts;
    expect(new Set(parts.map(part => part.costKey)).size).toBe(2);
    expect(parts.map(part => part.unitCost)).toEqual([1500, null]);
  });
  it('says what a staked form counts for', () => {
    const p = buildPortfolio(
      [holding({symbol: 'WSTETH', coinId: 'wrapped-steth', quantity: 2}), holding({})],
      {...quotes, 'wrapped-steth': quote('wrapped-steth', 'WSTETH', 2500, 0)},
    );
    expect(p.lines[0].parts.map(part => part.factor)).toEqual([1.25, null]);
  });
});

describe('price ids', () => {
  const ids = parseContractIds([
    {id: 'arbitrum', platforms: {'arbitrum-one': '0x912CE59144191C1204E64559FE8253a0e49E6548'}},
    {id: 'jupiter-staked-sol', platforms: {solana: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'}},
    {id: 'bitcoin', platforms: {}},
  ]);
  const arbitrum = TOKEN_CHAINS.find(c => c.key === 'arbitrum')!;
  const solana = TOKEN_CHAINS.find(c => c.key === 'solana')!;
  it('finds the id of a contract whatever the case of an EVM address', () => {
    expect(
      withPriceId(arbitrum, {address: '0x912ce59144191c1204e64559fe8253a0e49e6548'}, ids).coinId,
    ).toBe('arbitrum');
    expect(
      withPriceId(solana, {address: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'}, ids).coinId,
    ).toBe('jupiter-staked-sol');
  });
  it('marks a contract the table does not have, and clears the mark when found', () => {
    expect(withPriceId(arbitrum, {address: '0xabc'}, ids)).toEqual({
      address: '0xabc',
      coinId: null,
      noPrice: true,
    });
    expect(
      withPriceId(
        arbitrum,
        {address: '0x912ce59144191c1204e64559fe8253a0e49e6548', noPrice: true},
        ids,
      ),
    ).toEqual({address: '0x912ce59144191c1204e64559fe8253a0e49e6548', coinId: 'arbitrum'});
  });
});

describe('reads', () => {
  it('asks each EVM chain that is switched on, once per address', () => {
    const sources = sourcesFor(
      [
        {family: 'evm', address: EVM, name: 'a'},
        {family: 'bitcoin', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', name: ''},
      ],
      {},
      ['bnb', 'hyperevm'],
    );
    expect(sources.map(s => s.key.split(':')[0])).toEqual([
      'hyperliquid', 'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'avalanche', 'bitcoin',
    ]);
  });
  it('keeps the last amounts of a read that fails', async () => {
    const previous = [holding({source: 'bad', quantity: 9}), holding({source: 'gone', quantity: 5})];
    const result = await readAll(
      [
        {key: 'ok', label: 'Good', read: async () => [holding({source: 'ok', quantity: 2}), holding({source: 'ok', quantity: 0})]},
        {key: 'bad', label: 'Bad node', read: async () => { throw new Error('server did not answer'); }},
      ],
      previous,
    );
    expect(result.failed).toEqual(['Bad node: server did not answer']);
    expect(result.holdings.map(h => [h.source, h.quantity, !!h.stale]).sort()).toEqual([
      ['bad', 9, true],
      ['ok', 2, false],
    ]);
  });
});

describe('the file template', () => {
  it('holds only comments, so importing it adds nothing', () => {
    const {WALLETS_TEMPLATE} = require('../src/views/AddressesView');
    expect(parseWallets(WALLETS_TEMPLATE)).toEqual({wallets: [], problems: []});
  });
});

describe('searching a whole list', () => {
  it('asks many balances in one call', () => {
    expect(
      encodeBalances(
        [
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        ],
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      ),
    ).toBe(
      '0x82ad56cb0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000100000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000002470a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000000000000000000000000514910771af9ca656af840dff83e8264ecf986ca00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000002470a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000',
    );
  });
  it('reads the answer, a failed call counting as nothing', () => {
    expect(
      decodeBalances(
        '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000023781bc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).toEqual([37192124n, 0n]);
  });
});

describe('wallets by name', () => {
  const wallets = parseWallets(
    ['evm, ' + EVM + ', Ledger', 'btc, bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu, Ledger',
     'inj, inj1cr8te4kr609gcawutmrza0j4xv80jy8zdunxjf'].join('\n'),
  ).wallets;
  const portfolio = buildPortfolio(
    [
      holding({quantity: 1}),
      holding({chain: 'Base', quantity: 0.5}),
      holding({
        chain: 'Bitcoin',
        wallet: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        symbol: 'BTC',
        coinId: 'bitcoin',
        quantity: 0.1,
      }),
    ],
    {ethereum: quote('ethereum', 'ETH', 2000, 0), bitcoin: quote('bitcoin', 'BTC', 50000, 0)},
  );
  const groups = buildGroups(wallets, portfolio);
  it('joins the addresses that carry the same name', () => {
    expect(groups.map(g => [g.name, g.addresses.length, g.value])).toEqual([
      ['Ledger', 2, 8000],
      ['inj1cr8t…dunxjf', 1, 0],
    ]);
    expect(groups[0].share).toBeCloseTo(100, 6);
    expect(groups[0].chains.map(c => [c.chain, c.value])).toEqual([
      ['Bitcoin', 5000],
      ['Ethereum', 2000],
      ['Base', 1000],
    ]);
    expect(groups[0].chains[0].rows[0]).toMatchObject({line: 'bitcoin', price: 50000});
  });
  it('leaves out what is under the dust threshold, but counts it', () => {
    const [ledger] = buildGroups(wallets, portfolio, 1500);
    expect(ledger.value).toBe(8000);
    expect(ledger.chains.map(c => c.chain)).toEqual(['Bitcoin', 'Ethereum']);
  });
  it('writes a wallet as it is unfolded', () => {
    const text = walletText(groups[0], chain => chain.chain === 'Bitcoin', 'usd', 0, {
      chains: group => shown(chainCols({group, currency: 'usd'}), undefined),
      coins: chain => shown(coinCols({chain, currency: 'usd', quotes: {}}), ['value', 'share']),
    });
    // The columns picked, and only them.
    expect(text).toContain('COIN   VALUE  % CHAIN');
    expect(text).toContain('100.0%');
    expect(text).toContain('WALLET LEDGER');
    expect(text).toContain('BTC');
    expect(text).toContain('ETHEREUM');
    expect(text).not.toContain('ETH ');
  });
  it('rewrites the names in the file and adds what it lacks', () => {
    const file = '# my addresses\nevm, ' + EVM + ', Old\n\nnot an address\n';
    const text = syncWalletsFile(file, wallets);
    expect(text.split('\n')).toEqual([
      '# my addresses',
      'evm, ' + EVM + ', Ledger',
      '',
      'not an address',
      'btc, bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu, Ledger',
      'inj, inj1cr8te4kr609gcawutmrza0j4xv80jy8zdunxjf',
      '',
    ]);
    expect(parseWallets(text).wallets).toEqual(wallets);
    expect(dropFromWalletsFile(text, walletKey(wallets[1]))).not.toContain('bc1q');
  });
  it('draws a QR code a reader can find', () => {
    const matrix = qrMatrix(EVM);
    expect(matrix.length).toBe(matrix[0].length);
    expect(matrix.length).toBeGreaterThanOrEqual(25);
    // The three corner squares start with seven dark modules.
    expect(matrix[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(darkRuns([true, true, false, true])).toEqual([[0, 2], [3, 1]]);
    expect(darkRuns(matrix[0])[0]).toEqual([0, 7]);
  });
});

describe('the support page', () => {
  it('shows addresses the plugin itself accepts as public addresses', () => {
    expect(TIPS.map(tip => familiesOf(tip.address))).toEqual([['evm'], ['solana']]);
    // The README gives the same ones.
    const readme = require('fs').readFileSync(`${__dirname}/../README.md`, 'utf8');
    TIPS.forEach(tip => expect(readme).toContain(`\`${tip.address}\``));
    expect(HELP_URL).toMatch(/^https:\/\/github\.com\/coldpaper-dev\/SuperNote-CryptoView\//);
  });
});

describe('a table sorted by a column', () => {
  const rows = [{n: 'b', v: 2}, {n: 'c', v: null}, {n: 'a', v: 10}];
  it('orders figures and names, and keeps what has no figure last', () => {
    expect(sortBy(rows, r => r.v, true).map(r => r.n)).toEqual(['a', 'b', 'c']);
    expect(sortBy(rows, r => r.v, false).map(r => r.n)).toEqual(['b', 'a', 'c']);
    expect(sortBy(rows, r => r.n, false).map(r => r.n)).toEqual(['a', 'b', 'c']);
  });
});

describe('what the second review found', () => {
  it('takes a NEAR account under any name when the chain is given', () => {
    expect(fitsFamily('relay.aurora', 'near')).toBe(true);
    expect(fitsFamily('aurora', 'near')).toBe(true);
    expect(fitsFamily('Not An Account', 'near')).toBe(false);
    expect(parseWallets('near, relay.aurora, Main').wallets).toEqual([
      {family: 'near', address: 'relay.aurora', name: 'Main'},
    ]);
    // Without the chain a bare word is not taken for an account.
    expect(parseWallets('relay').wallets).toEqual([]);
  });
  it('fills the price ids of the tokens that lack one', () => {
    const [arbitrum] = TOKEN_CHAINS.filter(chain => chain.key === 'arbitrum');
    const token = {address: '0x912ce59144191c1204e64559fe8253a0e49e6548', symbol: 'ARB', name: 'ARB', decimals: 18};
    const ids = parseContractIds([
      {id: 'arbitrum', platforms: {'arbitrum-one': token.address}},
    ]);
    const tokens = {arbitrum: [{...token, coinId: null}, {...token, address: '0x01', coinId: null, noPrice: true}]};
    expect(fillPriceIds(tokens, ids, false).arbitrum.map(t => t.coinId)).toEqual(['arbitrum', null]);
    expect(fillPriceIds(tokens, new Map(), true).arbitrum.every(t => t.noPrice)).toBe(true);
    expect(mirrorsNative(arbitrum, {symbol: 'ETH', coinId: 'ethereum'})).toBe(true);
    expect(mirrorsNative(arbitrum, {symbol: 'ARB', coinId: 'arbitrum'})).toBe(false);
  });
  it('writes the same figures on screen and in a note', () => {
    expect(fmtSignedPct(120)).toBe('+120%');
    expect(fmtSignedPct(-5.25)).toBe('-5.3%');
    expect(fmtGain(120, 1000, 'eur')).toBe('+€120.00 (+12.0%)');
    expect(fmtGain(null, null, 'eur')).toBe('-');
  });
});
