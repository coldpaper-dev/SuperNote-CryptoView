/**
 * The whole plugin, with the network and the host replaced: it must show the
 * stored prices at once, then the fresh ones.
 */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    getPluginDirPath: async () => '/plugin',
    hasPermission: async () => 1,
    requestPermission: async () => 2,
  },
}));

import App from '../App';

const row = (id: string, symbol: string, price: number) => ({
  id,
  symbol,
  name: id,
  market_cap_rank: 1,
  current_price: price,
  price_change_percentage_24h_in_currency: 1.25,
  price_change_percentage_7d_in_currency: -3.2,
});

const texts = (tree: ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(Infinity).join(''))
    .join('\n');

const settle = () => act(async () => new Promise(r => setTimeout(r, 20)));

describe('App', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    (global as {fetch: unknown}).fetch = async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => [
          row('bitcoin', 'btc', 74053),
          row('ethereum', 'eth', 2237.45),
        ],
      };
    };
  });

  it('reads the favorites at opening, in euro, in one request', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await settle();
    // The prices first; then, with no list of coins stored, the list.
    expect(calls[0]).toContain('vs_currency=eur');
    expect(calls.filter(url => url.includes('ids='))).toHaveLength(1);
    expect(calls[1]).toContain('order=market_cap_desc');
    expect(calls[0]).toContain('ids=bitcoin,ethereum,solana');
    const shown = texts(tree);
    expect(shown).toContain('BTC');
    expect(shown).toContain('€74,053');
    expect(shown).toContain('▲ +1.3%');
    expect(shown).toContain('▼ -3.2%');
    expect(shown).toContain('UPDATED');
    // A favorite the server did not return keeps its line.
    expect(shown).toContain('solana');
  });

  it('says why when the network fails', async () => {
    (global as {fetch: unknown}).fetch = async () => {
      throw new Error('Network request failed');
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await settle();
    expect(texts(tree)).toContain('NETWORK REQUEST FAILED · NO PRICE YET');
  });
});
