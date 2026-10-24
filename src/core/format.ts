/**
 * Numbers as text. Written by hand: the plugin's JS engine is not
 * guaranteed to ship locale data.
 */
import {Currency} from './model';

const SIGN: Record<Currency, string> = {eur: '€', usd: '$'};

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Fewer decimals as the number grows: 74,053 / 98.42 / 0.2029 / 0.00001234. */
export function fmtNumber(value: number): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1000) {
    text = abs.toFixed(0);
  } else if (abs >= 1) {
    text = abs.toFixed(2);
  } else if (abs >= 0.01) {
    text = abs.toFixed(4);
  } else if (abs === 0) {
    text = '0';
  } else {
    // Four significant digits, without the exponent toPrecision may add.
    const decimals = Math.min(12, 3 - Math.floor(Math.log10(abs)));
    text = abs.toFixed(decimals);
  }
  const [whole, fraction] = text.split('.');
  return (
    (value < 0 ? '-' : '') + group(whole) + (fraction ? `.${fraction}` : '')
  );
}

export function fmtPrice(value: number | null, currency: Currency): string {
  return value === null ? '-' : `${SIGN[currency]}${fmtNumber(value)}`;
}

/** A display currency and what one US dollar is worth in it. */
export interface Money {
  currency: Currency;
  rate: number;
}
export const DOLLARS: Money = {currency: 'usd', rate: 1};

/** An amount counted in dollars, shown in the display currency. */
export function fmtMoney(dollars: number | null, money: Money): string {
  return fmtPrice(dollars === null ? null : dollars * money.rate, money.currency);
}

/** The same with its sign in front: +€12.40, -€3.10. */
export function fmtSigned(dollars: number, money: Money): string {
  const sign = dollars > 0 ? '+' : dollars < 0 ? '-' : '';
  return sign + fmtMoney(Math.abs(dollars), money);
}

/** 1.47T / 269.8B / 12.3M, for a market capitalisation. */
export function fmtLarge(value: number | null, currency: Currency): string {
  if (value === null) {
    return '-';
  }
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, letter] of units) {
    if (value >= size) {
      const scaled = value / size;
      return `${SIGN[currency]}${scaled.toFixed(scaled >= 100 ? 1 : 2)}${letter}`;
    }
  }
  return `${SIGN[currency]}${value.toFixed(0)}`;
}

/** #12, the place of a coin by market capitalisation; - when it has none. */
export const fmtRank = (rank: number): string => (rank > 0 ? `#${rank}` : '-');

/** The direction is carried by a sign and an arrow: the screen has no colour. */
export function fmtChange(value: number | null): string {
  if (value === null) {
    return '-';
  }
  const abs = Math.abs(value);
  const text = abs >= 1000 ? abs.toFixed(0) : abs.toFixed(abs >= 100 ? 0 : 1);
  if (Number(text) === 0) {
    return '0.0%';
  }
  return value > 0 ? `▲ +${group(text)}%` : `▼ -${group(text)}%`;
}

const two = (n: number) => String(n).padStart(2, '0');
export const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');

/** 21:42 today, otherwise 10 OCT 21:42. */
export function fmtWhen(at: number, now: number = Date.now()): string {
  if (at <= 0) {
    return 'NEVER';
  }
  const d = new Date(at);
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (new Date(now).toDateString() === d.toDateString()) {
    return time;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}

/** 11 OCT 2026 21:42, for something that will be read on another day. */
export function fmtDate(at: number): string {
  const d = new Date(at);
  return (
    `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ` +
    `${two(d.getHours())}:${two(d.getMinutes())}`
  );
}

/** 11/10 18:45, short enough for a column. */
export function fmtShortTime(at: number): string {
  const d = new Date(at);
  return (
    `${two(d.getDate())}/${two(d.getMonth() + 1)} ` +
    `${two(d.getHours())}:${two(d.getMinutes())}`
  );
}

/** 12.3%, without a sign: a ratio or a distance, not a change. */
export const fmtPct = (value: number | null, digits = 1): string =>
  value === null ? '-' : `${value.toFixed(digits)}%`;

/** +€120 / -€45: an amount with its sign. */
export function fmtSignedPrice(value: number, currency: Currency): string {
  return (value > 0 ? '+' : value < 0 ? '-' : '') + fmtPrice(Math.abs(value), currency);
}

/** +5.2% / -120%: whole percents from a hundred. */
export function fmtSignedPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

/** +€120 (+5.2%): a gain and what it is of the price paid. */
export function fmtGain(
  pnl: number | null,
  paid: number | null,
  currency: Currency,
): string {
  if (pnl === null) {
    return '-';
  }
  return (
    fmtSignedPrice(pnl, currency) +
    (paid ? ` (${fmtSignedPct((pnl / paid) * 100)})` : '')
  );
}

/**
 * What is typed for an amount, kept to digits and one decimal point. A
 * comma becomes the point, so that what is read is what is shown.
 */
export function decimalText(text: string): string {
  const [whole, ...rest] = text.replace(/,/g, '.').replace(/[^0-9.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

/** A series averaged down to at most `columns` values, for a chart. */
export function thin(values: number[], columns: number): number[] {
  if (values.length <= columns) {
    return values;
  }
  return Array.from({length: columns}, (_, column) => {
    const from = Math.floor((column * values.length) / columns);
    const to = Math.floor(((column + 1) * values.length) / columns);
    return values.slice(from, to).reduce((sum, v) => sum + v, 0) / (to - from);
  });
}
