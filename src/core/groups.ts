/**
 * The portfolio seen by wallet: a wallet is every address that carries the
 * same name, whatever the chain.
 */
import {FAMILY_NAMES, Family} from './chains';
import {isTyped, ManualAccount, manualWallet} from './manual';
import {Line, Portfolio} from './portfolio';
import {USDC_ID} from './tokens';
import {Wallet, walletName} from './wallets';

/** One coin at one address on one chain. */
export interface GroupRow {
  /** Key of the portfolio line it belongs to. */
  line: string;
  /** Its own price id; null for a coin without one, and for cash. */
  coinId: string | null;
  symbol: string;
  quantity: number;
  price: number | null;
  value: number | null;
  /** Gain on what was paid, when a price paid is known. */
  pnl: number | null;
  /** What was paid for it, with `pnl`. */
  paid: number | null;
  /** True when the amount comes from an earlier read. */
  stale: boolean;
  note?: string;
}

export interface GroupChain {
  chain: string;
  address: string;
  value: number;
  rows: GroupRow[];
}

export interface GroupAddress {
  family: Family;
  /** EVM, Bitcoin... as the user reads it. */
  kind: string;
  address: string;
}

export interface WalletGroup {
  name: string;
  value: number;
  /** Share of the total, in percent. */
  share: number | null;
  /** Gain on the coins that have a price paid, dust included. */
  pnl: number | null;
  /** What those coins cost. */
  paid: number;
  /** True when some coins have no price paid: the gain covers the others. */
  pnlPartial: boolean;
  addresses: GroupAddress[];
  /** With typed balances: when they were last changed. */
  manual?: {at: number};
  /** Chains that hold something worth listing, largest value first. */
  chains: GroupChain[];
}

/**
 * `dust` is the value under which a coin is not listed; a chain left with
 * nothing to list is dropped. Values and shares still count everything.
 * `manual` are the balances typed by the user, by wallet name: they sit on
 * chains of their own, apart from those of the addresses.
 */
export function buildGroups(
  wallets: Wallet[],
  portfolio: Portfolio,
  dust: number = 0,
  manual: ManualAccount[] = [],
): WalletGroup[] {
  const groups = new Map<string, WalletGroup>();
  const ofAddress = new Map<string, WalletGroup>();
  for (const wallet of wallets) {
    const name = walletName(wallet);
    let group = groups.get(name);
    if (!group) {
      group = {
        name,
        value: 0,
        share: null,
        pnl: null,
        paid: 0,
        pnlPartial: false,
        addresses: [],
        chains: [],
      };
      groups.set(name, group);
    }
    group.addresses.push({
      family: wallet.family,
      kind: FAMILY_NAMES[wallet.family],
      address: wallet.address,
    });
    ofAddress.set(wallet.address, group);
  }
  // Typed balances join the wallet of the same name, or make one.
  for (const account of manual) {
    let group = groups.get(account.name);
    if (!group) {
      group = {
        name: account.name,
        value: 0,
        share: null,
        pnl: null,
        paid: 0,
        pnlPartial: false,
        addresses: [],
        chains: [],
      };
      groups.set(account.name, group);
    }
    group.manual = {at: account.at};
    ofAddress.set(manualWallet(account.name), group);
  }
  // Spam is left out, as in the total.
  const lines: Line[] = [...portfolio.lines, ...portfolio.dust, ...portfolio.unpriced];
  for (const line of lines) {
    for (const part of line.parts) {
      const group = ofAddress.get(part.wallet);
      if (!group) {
        continue;
      }
      let chain = group.chains.find(
        c => c.chain === part.chain && c.address === part.wallet,
      );
      if (!chain) {
        chain = {chain: part.chain, address: part.wallet, value: 0, rows: []};
        group.chains.push(chain);
      }
      chain.rows.push({
        line: line.key,
        coinId: part.coinId,
        symbol: part.symbol,
        quantity: part.quantity,
        price: part.value !== null && part.quantity > 0 ? part.value / part.quantity : null,
        value: part.value,
        pnl: part.pnl,
        paid: part.unitCost === null ? null : part.quantity * part.unitCost,
        stale: part.stale === true,
        note: part.note,
      });
      if (part.pnl !== null) {
        group.pnl = (group.pnl ?? 0) + part.pnl;
        group.paid += part.quantity * part.unitCost!;
      } else if (
        part.value !== null &&
        part.value >= dust &&
        part.value > 0 &&
        line.key !== USDC_ID &&
        !(isTyped(part) && part.coinId === null)
      ) {
        // Only a coin the wallet lists makes its PnL partial, as dust
        // does not for the total.
        group.pnlPartial = true;
      }
      chain.value += part.value ?? 0;
      group.value += part.value ?? 0;
    }
  }
  const all = [...groups.values()];
  for (const group of all) {
    group.share = portfolio.total > 0 ? (group.value / portfolio.total) * 100 : null;
    for (const chain of group.chains) {
      chain.rows = chain.rows
        .filter(row => row.value !== null && row.value >= dust && row.value > 0)
        .sort((a, b) => b.value! - a.value!);
    }
    group.chains = group.chains
      .filter(chain => chain.rows.length > 0)
      .sort((a, b) => b.value - a.value);
  }
  return all.sort((a, b) => b.value - a.value);
}
