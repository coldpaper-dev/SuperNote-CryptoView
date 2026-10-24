/**
 * One way of calling a server: JSON in, JSON out, a time limit, and the
 * next address tried when one fails.
 */
import {version as APP_VERSION} from '../../package.json';

const TIMEOUT_MS = 12000;

export async function request(
  url: string,
  body?: unknown,
  timeoutMs: number = TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': `CryptoView/${APP_VERSION}`,
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429) {
      throw new Error('rate limit reached, try again in a minute');
    }
    if (!response.ok) {
      throw new Error(`server answered ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('server did not answer');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** A page or a feed as text, with the same time limit. */
export async function requestText(
  url: string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent': `CryptoView/${APP_VERSION}`,
      },
    });
    if (!response.ok) {
      throw new Error(`server answered ${response.status}`);
    }
    return await response.text();
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('server did not answer');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Tries each base address in turn; fails with the last error. */
export async function firstOf<T>(
  bases: readonly string[],
  call: (base: string) => Promise<T>,
): Promise<T> {
  let last: unknown = new Error('no server');
  for (const base of bases) {
    try {
      return await call(base);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * A whole number of base units (wei, satoshi...) as a decimal quantity.
 * Goes through BigInt: on-chain amounts exceed what a JS number holds exactly.
 */
export function toQuantity(units: bigint | string, decimals: number): number {
  const value = typeof units === 'bigint' ? units : BigInt(units);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : '';
  const quantity = Number(`${whole}.${fraction || '0'}`);
  return negative ? -quantity : quantity;
}
