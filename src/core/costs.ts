/**
 * The prices paid as a text file, so that they outlive the plugin and can
 * be typed from a computer. One holding per line; the last part is the key
 * the plugin keeps the price under, the first ones are there to be read.
 */
import {Cost} from './model';
import {Portfolio} from './portfolio';
import {nameOf} from './wallets';

export const COSTS_FILE = '/storage/emulated/0/MyStyle/Plugins/CryptoView/costs.txt';
/** The same as the user finds it from the tablet's file manager. */
export const COSTS_FILE_SHOWN = COSTS_FILE.replace('/storage/emulated/0/', '');

const HEADER = `# CryptoView - what you paid for one coin of each holding.
# One holding per line:   coin, chain, wallet, price, currency, key
# Fill in the price (with a dot: 0.25) and the currency (eur or usd).
# 0 is a coin received for free. A line with no price is ignored.
# Leave the key as it is: it tells the plugin which holding the line is.
# Lines starting with # are ignored.
`;

/** Every holding of the portfolio, with the price typed for it if any. */
export function costsFileText(
  portfolio: Portfolio,
  costs: Record<string, Cost>,
  names: Record<string, string>,
): string {
  const rows: string[] = [];
  const written = new Set<string>();
  const lines = [...portfolio.lines, ...portfolio.dust, ...portfolio.unpriced];
  for (const line of lines.sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    for (const part of line.parts) {
      const cost = costs[part.costKey];
      written.add(part.costKey);
      rows.push(
        [
          part.symbol,
          part.chain,
          nameOf(names, part.wallet),
          cost ? String(cost.price) : '',
          cost ? cost.currency : '',
          part.costKey,
        ].join(', '),
      );
    }
  }
  // A price typed for a holding that is not read any more is kept too.
  for (const key of Object.keys(costs)) {
    if (!written.has(key)) {
      rows.push(['?', '?', '?', String(costs[key].price), costs[key].currency, key].join(', '));
    }
  }
  return HEADER + rows.join('\n') + '\n';
}

export interface ParsedCosts {
  costs: Record<string, Cost>;
  /** Lines that could not be understood, as the user wrote them. */
  problems: string[];
}

/** The lines of the file that carry a price. */
export function parseCostsFile(text: string): ParsedCosts {
  const costs: Record<string, Cost> = {};
  const problems: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const fields = line.split(',').map(field => field.trim());
    const [price, currency] = [fields[3] ?? '', (fields[4] ?? '').toLowerCase()];
    // A key holds no comma today; joined again in case one ever does.
    const key = fields.slice(5).join(', ');
    if (price === '') {
      continue;
    }
    if (
      !/^\d*\.?\d+$/.test(price) ||
      (currency !== 'eur' && currency !== 'usd') ||
      key === ''
    ) {
      problems.push(`Not understood: ${line.slice(0, 60)}`);
      continue;
    }
    costs[key] = {price: Number(price), currency};
  }
  return {costs, problems};
}
