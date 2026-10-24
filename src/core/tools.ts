/**
 * The sums behind the Tools page. Nothing here reads the network: the
 * converter works from the prices already on the tablet.
 */
import {fmtNumber} from './format';
import {Quote} from './model';
import {USDC_ID} from './tokens';

/** Something an amount can be counted in: a currency or a coin. */
export interface Unit {
  key: string;
  label: string;
  /** What one of it is worth in the display currency. */
  rate: number;
}

/**
 * Euro and dollar first, then the coins followed that have a price. `eur`
 * and `usd` are what one of each is worth in the display currency; a
 * currency whose rate is not known yet is left out.
 */
export function unitsOf(
  favorites: string[],
  quotes: Record<string, Quote>,
  eur: number | null,
  usd: number | null,
): Unit[] {
  const units: Unit[] = [];
  const add = (key: string, label: string, rate: number | null) => {
    if (rate !== null && rate > 0) {
      units.push({key, label, rate});
    }
  };
  add('eur', 'EUR', eur);
  add('usd', 'USD', usd);
  for (const id of favorites) {
    const quote = quotes[id];
    // USDC is one dollar by decision, here as everywhere else.
    add(id, quote?.symbol ?? id, id === USDC_ID && usd !== null ? usd : quote?.price ?? null);
  }
  return units;
}

/** An amount of one unit counted in another. */
export const convert = (amount: number, from: Unit, to: Unit): number =>
  (amount * from.rate) / to.rate;

/** A number as it can be typed again: no thousands separator. */
export const plain = (value: number): string => fmtNumber(value).replace(/,/g, '');

export interface Buy {
  quantity: number;
  price: number;
}

/** What several buys add up to; null when nothing was bought. */
export function averageCost(
  buys: Buy[],
): {quantity: number; spent: number; average: number} | null {
  const quantity = buys.reduce((sum, buy) => sum + buy.quantity, 0);
  const spent = buys.reduce((sum, buy) => sum + buy.quantity * buy.price, 0);
  return quantity > 0 ? {quantity, spent, average: spent / quantity} : null;
}

export interface Leveraged {
  /** Value of the position when opened: the margin times the leverage. */
  size: number;
  quantity: number;
  /** null when the position cannot be liquidated (a long at 1x). */
  liquidation: number | null;
  /** How far the entry is from it, in percent. */
  distance: number | null;
}

/**
 * An isolated position as Hyperliquid liquidates it: the maintenance margin
 * is half the initial margin at the market's highest leverage. Fees and
 * funding are left out.
 */
export function leveraged(input: {
  entry: number;
  margin: number;
  leverage: number;
  maxLeverage: number;
  long: boolean;
}): Leveraged | null {
  const {entry, margin, leverage, maxLeverage, long} = input;
  if (!(entry > 0) || !(margin > 0) || !(leverage >= 1) || !(maxLeverage >= leverage)) {
    return null;
  }
  const side = long ? 1 : -1;
  const maintenance = 1 / (2 * maxLeverage);
  const price =
    entry - (side * entry * (1 / leverage - maintenance)) / (1 - maintenance * side);
  const liquidation = price > 0 ? price : null;
  return {
    size: margin * leverage,
    quantity: (margin * leverage) / entry,
    liquidation,
    distance: liquidation === null ? null : (Math.abs(entry - liquidation) / entry) * 100,
  };
}
