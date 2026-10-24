/**
 * @jest-environment node
 *
 * Reads real public addresses from the real servers. Skipped unless LIVE=1:
 * it needs the network and must not run with the ordinary tests.
 */
import {COSMOS_CHAINS, TOKEN_CHAINS} from '../../src/core/chains';
import {
  fetchAbout,
  fetchChart,
  fetchQuotes,
  fetchUsdEur,
} from '../../src/core/coingecko';
import {fetchHlAccount, fetchHlMarket, hlParts} from '../../src/core/hyperliquid';
import {request} from '../../src/core/http';
import {findHeld, readAll, sourcesFor} from '../../src/core/readers';
import {
  fetchCoinId,
  fetchContractIds,
  fetchTokenList,
  searchTokens,
  Token,
  withPriceId,
} from '../../src/core/tokens';
import {Wallet} from '../../src/core/wallets';

const live = process.env.LIVE === '1' ? describe : describe.skip;
// Tests that need an address holding funds take it from the environment, so
// that nobody's address is written here. Skipped when the variable is unset.
const EVM_HOLDER = process.env.LIVE_EVM ?? '';
const SOLANA_HOLDER = process.env.LIVE_SOLANA ?? '';
const withEvm = EVM_HOLDER ? it : it.skip;
const withBoth = EVM_HOLDER && SOLANA_HOLDER ? it : it.skip;
jest.setTimeout(120000);

live('public servers', () => {
  it('reads every chain', async () => {
    const wallets: Wallet[] = [
      {family: 'evm', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', name: 'evm'},
      {family: 'bitcoin', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', name: 'p2pkh'},
      {family: 'bitcoin', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', name: 'segwit'},
      {family: 'solana', address: 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg', name: 'sol'},
      {family: 'near', address: 'aurora', name: 'near', pools: ['figment.poolv1.near']},
    ];
    // near's shape needs a dotted name; 'aurora' is a real top-level account.
    for (const chain of COSMOS_CHAINS) {
      const accounts = (await request(
        `${chain.rest[0]}/cosmos/auth/v1beta1/module_accounts`,
      )) as any;
      const address = accounts.accounts
        .map((a: any) => a.base_account?.address ?? a.value?.address)
        .find((a: unknown) => typeof a === 'string');
      wallets.push({family: chain.family, address, name: chain.family});
    }
    const usdc: Token = {
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC', name: 'USDC', decimals: 6, coinId: 'usd-coin',
    };
    const solUsdc: Token = {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC', name: 'USDC', decimals: 6, coinId: 'usd-coin',
    };
    const sources = sourcesFor(wallets, {ethereum: [usdc], solana: [solUsdc]}, []);
    const result = await readAll(sources, []);
    console.log(
      result.holdings
        .map(h => `${h.chain.padEnd(11)} ${h.symbol.padEnd(6)} ${h.quantity} ${h.note ?? ''}`)
        .sort()
        .join('\n'),
    );
    console.log('FAILED', result.failed);
    expect(result.failed).toEqual([]);
    // One read per token chain, Hyperliquid, two Bitcoin addresses, NEAR, and the Cosmos chains.
    expect(result.total).toBe(TOKEN_CHAINS.length + 4 + COSMOS_CHAINS.length);
  });

  it('downloads a token list and resolves a price id', async () => {
    const chain = TOKEN_CHAINS.find(c => c.key === 'base')!;
    const list = await fetchTokenList(chain);
    expect(list.length).toBeGreaterThan(500);
    const found = searchTokens(list, 'usdc', 5);
    console.log(found);
    expect(await fetchCoinId(chain, found[0][0])).toBeTruthy();
  });

  withBoth('finds the tokens an address holds, on an EVM chain and on Solana', async () => {
    const hyper = TOKEN_CHAINS.find(c => c.key === 'hyperevm')!;
    const list = await fetchTokenList(hyper);
    const held = await findHeld(hyper, EVM_HOLDER, list);
    console.log(held);
    expect(held.map(t => t[1])).toContain('USDC');
    const solana = TOKEN_CHAINS.find(c => c.key === 'solana')!;
    const sol = await findHeld(solana, SOLANA_HOLDER, await fetchTokenList(solana));
    console.log(sol);
    expect(sol.length).toBeGreaterThan(0);
  });

  withEvm('reads a Hyperliquid account whose parts add up to its value', async () => {
    const market = await fetchHlMarket();
    const account = await fetchHlAccount(EVM_HOLDER, market);
    const sum = hlParts(account).reduce((s, p) => s + p.quantity * (p.usd ?? 0), 0);
    console.log(account.accountValue, sum, account.positions, account.staking, account.periods);
    expect(account.accountValue).toBeGreaterThan(0);
    // The exchange's own figure and the sum of the parts agree within 1%.
    expect(Math.abs(sum - account.accountValue!) / account.accountValue!).toBeLessThan(0.01);
  });

  it('reads a price history', async () => {
    const points = await fetchChart('bitcoin', 'eur', 7);
    expect(points.length).toBeGreaterThan(100);
  });

  it('finds the price id of contracts in one request', async () => {
    const ids = await fetchContractIds();
    const on = (key: string) => TOKEN_CHAINS.find(c => c.key === key)!;
    expect(
      [
        withPriceId(on('arbitrum'), {address: '0x912ce59144191c1204e64559fe8253a0e49e6548'}, ids),
        withPriceId(on('solana'), {address: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'}, ids),
        withPriceId(on('arbitrum'), {address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'}, ids),
      ].map(t => t.coinId),
    ).toEqual(['arbitrum', 'jupiter-staked-sol', 'usd-coin']);
  }, 60000);

  it('reads the extra facts of a coin, its description and the euro rate', async () => {
    const quote = (await fetchQuotes(['solana'], 'eur')).solana;
    expect(quote.volume).toBeGreaterThan(0);
    expect(quote.circulating).toBeGreaterThan(0);
    expect(quote.athDate).toMatch(/^20/);
    expect(quote.atl).toBeGreaterThan(0);
    const about = await fetchAbout('solana');
    console.log(about);
    expect(about.description.length).toBeGreaterThan(50);
    const rate = await fetchUsdEur();
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(1.5);
  }, 60000);
});
