/**
 * The tables that slide sideways, drawn with real figures: the columns
 * picked are the ones shown, and what unfolds under a row is there.
 */
import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {buildGroups} from '../src/core/groups';
import {EMPTY_BALANCES, Quote} from '../src/core/model';
import {buildPortfolio} from '../src/core/portfolio';
import {Holding} from '../src/core/readers';
import {Wallet} from '../src/core/wallets';
import {PickedColumns} from '../src/ui/kit';
import {PortfolioView} from '../src/views/PortfolioView';
import {WalletsTree} from '../src/views/WalletsTree';

const quote = (id: string, symbol: string, price: number): Quote =>
  ({
    id,
    symbol,
    name: id,
    rank: 2,
    price,
    marketCap: 5e9,
    changes: {h1: null, h24: 1, d7: 2, d14: null, d30: 3, d200: null, y1: null},
  } as Quote);
const quotes = {ethereum: quote('ethereum', 'ETH', 2000)};
const holding: Holding = {
  source: 'ethereum:0xabc',
  wallet: '0xabc',
  chain: 'Ethereum',
  symbol: 'ETH',
  name: 'Ethereum',
  quantity: 2,
  coinId: 'ethereum',
};
const portfolio = buildPortfolio([holding], quotes, 1, {currency: 'usd'});
const wallets = [{family: 'evm', address: '0xabc', name: 'Main'}] as Wallet[];

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity).join(''));
const draw = (node: React.ReactElement, picked: Record<string, string[]> = {}) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PickedColumns.Provider value={{picked, onPick: () => {}}}>{node}</PickedColumns.Provider>,
    );
  });
  return tree;
};

describe('tables', () => {
  const view = (
    <PortfolioView
      portfolio={portfolio}
      balances={EMPTY_BALANCES}
      pricesAt={0}
      error=""
      busy={false}
      onBalances={() => {}}
      onPrices={() => {}}
      currency="usd"
      hasWallets
      perps={[]}
      perpsPnl=""
      quotes={quotes}
      names={{'0xabc': 'Main'}}
      onOpen={() => {}}
    />
  );
  it('shows the usual columns of the portfolio, or the ones picked', () => {
    const usual = texts(draw(view));
    expect(usual).toEqual(expect.arrayContaining(['ETH', '$4,000', 'PnL%']));
    expect(usual).not.toContain('Mkt cap');
    const picked = texts(draw(view, {portfolio: ['cap', 'd7', 'wallets']}));
    expect(picked).toEqual(expect.arrayContaining(['ETH', '$5.00B', '▲ +2.0%', '1']));
    expect(picked).not.toContain('Quantity');
  });
  it('numbers the picked columns in the order they were picked', () => {
    const tree = draw(view, {portfolio: ['value', 'price']});
    const labelled = (label: string) =>
      tree.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === label);
    expect(labelled('Value, column 1')).toHaveLength(0);
    act(() => labelled('Choose the columns')[0].props.onPress());
    expect(labelled('Value, column 1')).toHaveLength(1);
    expect(labelled('Price, column 2')).toHaveLength(1);
    expect(labelled('Quantity')).toHaveLength(1);
  });
  it('unfolds a wallet into its chains and a chain into its coins', () => {
    const groups = buildGroups(wallets, portfolio, 0);
    const tree = draw(
      <WalletsTree
        groups={groups}
        currency="usd"
        total={portfolio.total}
        quotes={quotes}
        onAddress={() => {}}
        onCoin={() => {}}
        onManual={() => {}}
        copy={() => null}
      />,
    );
    const tap = (label: string) =>
      act(() => {
        tree.root
          .findAllByType(Pressable)
          .find(node => node.findAllByType(Text).some(t => t.props.children === label))!
          .props.onPress();
      });
    expect(texts(tree)).toContain('▶ Main');
    tap('▶ Main');
    expect(texts(tree)).toEqual(expect.arrayContaining(['▼ Main', '▶ Ethereum', 'QR']));
    tap('▶ Ethereum');
    expect(texts(tree)).toEqual(expect.arrayContaining(['▼ Ethereum', 'ETH', '2.00']));
  });
});
