/**
 * Prices from the public CoinGecko API (no key). One request returns the
 * price and every change for up to 250 coins.
 */
import {thin} from './format';
import {request} from './http';
import {Coin, Currency, Quote} from './model';

const BASE = 'https://api.coingecko.com/api/v3';
const PER_PAGE = 250;
/** Pages of the search list: the first 1000 coins by market capitalisation. */
const LIST_PAGES = 4;
/** The keyless API allows few requests a minute; leave room between pages. */
const PAGE_PAUSE_MS = 1500;

export const HOSTS = ['api.coingecko.com'];

/** Asked again once after a pause when the server says it is busy. */
async function getJson(url: string): Promise<unknown> {
  try {
    return await request(url);
  } catch (e) {
    if (!/rate limit/.test((e as Error).message)) {
      throw e;
    }
    await new Promise(resolve => setTimeout(resolve, 6000));
    return request(url);
  }
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : null;

/** One row of /coins/markets; null when it has no usable price. */
export function parseQuote(raw: unknown): Quote | null {
  const r = raw as Record<string, unknown> | null;
  const price = num(r?.current_price);
  if (!r || typeof r.id !== 'string' || price === null) {
    return null;
  }
  const change = (span: string) =>
    num(r[`price_change_percentage_${span}_in_currency`]);
  return {
    id: r.id,
    symbol: String(r.symbol ?? '').toUpperCase(),
    name: String(r.name ?? r.id),
    rank: num(r.market_cap_rank) ?? 0,
    price,
    high24h: num(r.high_24h),
    low24h: num(r.low_24h),
    marketCap: num(r.market_cap),
    ath: num(r.ath),
    athChange: num(r.ath_change_percentage),
    athDate: typeof r.ath_date === 'string' ? r.ath_date : null,
    atl: num(r.atl),
    atlChange: num(r.atl_change_percentage),
    atlDate: typeof r.atl_date === 'string' ? r.atl_date : null,
    volume: num(r.total_volume),
    circulating: num(r.circulating_supply),
    maxSupply: num(r.max_supply),
    fdv: num(r.fully_diluted_valuation),
    changes: {
      h1: change('1h'),
      h24: change('24h') ?? num(r.price_change_percentage_24h),
      d7: change('7d'),
      d14: change('14d'),
      d30: change('30d'),
      d200: change('200d'),
      y1: change('1y'),
    },
  };
}

export function marketsUrl(ids: string[], currency: Currency): string {
  return (
    `${BASE}/coins/markets?vs_currency=${currency}` +
    `&ids=${ids.map(encodeURIComponent).join(',')}` +
    `&per_page=${PER_PAGE}&price_change_percentage=1h,24h,7d,14d,30d,200d,1y`
  );
}

/** Quotes by coin id. An id the server does not know is simply absent. */
export async function fetchQuotes(
  ids: string[],
  currency: Currency,
): Promise<Record<string, Quote>> {
  const quotes: Record<string, Quote> = {};
  for (let start = 0; start < ids.length; start += PER_PAGE) {
    const rows = await getJson(
      marketsUrl(ids.slice(start, start + PER_PAGE), currency),
    );
    for (const row of Array.isArray(rows) ? rows : []) {
      const quote = parseQuote(row);
      if (quote) {
        quotes[quote.id] = quote;
      }
    }
  }
  return quotes;
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** The coins the search offers, largest first. */
export async function fetchCoinList(
  onPage?: (done: number, total: number) => void,
): Promise<Coin[]> {
  const coins: Coin[] = [];
  for (let page = 1; page <= LIST_PAGES; page++) {
    if (page > 1) {
      await pause(PAGE_PAUSE_MS);
    }
    const rows = await getJson(
      `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc` +
        `&per_page=${PER_PAGE}&page=${page}`,
    );
    for (const row of Array.isArray(rows) ? rows : []) {
      const quote = parseQuote(row);
      if (quote) {
        coins.push({
          id: quote.id,
          symbol: quote.symbol,
          name: quote.name,
          rank: quote.rank || coins.length + 1,
        });
      }
    }
    onPage?.(page, LIST_PAGES);
  }
  return coins;
}

/** Spans the chart offers, in days. */
export const CHART_SPANS = [1, 7, 30, 365] as const;
export type ChartSpan = (typeof CHART_SPANS)[number];

/** Prices over the last `days` days, oldest first: [time in ms, price]. */
export async function fetchChart(
  id: string,
  currency: Currency,
  days: ChartSpan,
): Promise<[number, number][]> {
  const raw = (await getJson(
    `${BASE}/coins/${encodeURIComponent(id)}/market_chart` +
      `?vs_currency=${currency}&days=${days}`,
  )) as {prices?: unknown};
  return (Array.isArray(raw?.prices) ? raw.prices : []).filter(
    (point): point is [number, number] =>
      Array.isArray(point) &&
      typeof point[0] === 'number' &&
      typeof point[1] === 'number',
  );
}

/**
 * At most `columns` values, each the average of its share of the points, so
 * a year of prices fits the width of the screen.
 */
export const downsample = (points: [number, number][], columns: number): number[] =>
  thin(points.map(point => point[1]), columns);

/** Euros for one US dollar, from the price of USDC in both. */
export async function fetchUsdEur(): Promise<number | null> {
  const raw = (await getJson(
    `${BASE}/simple/price?ids=usd-coin&vs_currencies=eur,usd`,
  )) as {'usd-coin'?: {eur?: unknown; usd?: unknown}} | null;
  const eur = num(raw?.['usd-coin']?.eur);
  const usd = num(raw?.['usd-coin']?.usd);
  return eur !== null && usd !== null && usd > 0 ? eur / usd : null;
}

/** What a coin is, in its makers' words. Asked only when the user wants it. */
export interface About {
  description: string;
  categories: string[];
  site: string;
  /** Day the coin started, yyyy-mm-dd; '' when unknown. */
  since: string;
}

const ABOUT_LENGTH = 900;

function parseAbout(raw: unknown): About {
  const r = raw as Record<string, any> | null;
  const text = String(r?.description?.en ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = text.length > ABOUT_LENGTH ? text.slice(0, ABOUT_LENGTH) : text;
  // Stop at the end of a sentence rather than in the middle of a word.
  const end = cut.lastIndexOf('. ');
  return {
    description:
      text.length > ABOUT_LENGTH ? cut.slice(0, end > 200 ? end + 1 : cut.length) + ' ...' : text,
    categories: (Array.isArray(r?.categories) ? r!.categories : [])
      .filter((c: unknown) => typeof c === 'string')
      .slice(0, 6),
    site: String(r?.links?.homepage?.find?.((url: unknown) => !!url) ?? ''),
    since: typeof r?.genesis_date === 'string' ? r.genesis_date : '',
  };
}

export async function fetchAbout(id: string): Promise<About> {
  return parseAbout(
    await getJson(
      `${BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false` +
        '&market_data=false&community_data=false&developer_data=false&sparkline=false',
    ),
  );
}
