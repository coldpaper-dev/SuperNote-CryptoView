import {Coin} from './model';

/**
 * Coins matching what was typed, best first: the exact symbol, then symbols
 * and names starting with it, then names containing it. Within a group the
 * largest coin comes first, so "eth" offers Ethereum before its namesakes.
 */
export function searchCoins(coins: Coin[], typed: string): Coin[] {
  const q = typed.trim().toLowerCase();
  if (q === '') {
    return [];
  }
  const groups: Coin[][] = [[], [], [], []];
  for (const coin of coins) {
    const symbol = coin.symbol.toLowerCase();
    const name = coin.name.toLowerCase();
    if (symbol === q) {
      groups[0].push(coin);
    } else if (symbol.startsWith(q)) {
      groups[1].push(coin);
    } else if (name.startsWith(q)) {
      groups[2].push(coin);
    } else if (name.includes(q)) {
      groups[3].push(coin);
    }
  }
  return groups.flatMap(group => group.sort((a, b) => a.rank - b.rank));
}
