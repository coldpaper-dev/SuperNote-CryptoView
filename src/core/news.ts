/**
 * Crypto news from the public RSS feeds of a few sites: no key, no account.
 * These three put the whole article in the feed, so it can be read on the
 * tablet; when one sends a summary only, the summary is what is shown.
 */
import {requestText} from './http';

export interface Feed {
  key: string;
  label: string;
  url: string;
  /** The site, as said under an article. */
  site: string;
}

export const FEEDS: Feed[] = [
  {
    key: 'cryptonews',
    label: 'Cryptonews',
    url: 'https://cryptonews.com/news/feed/',
    site: 'cryptonews.com',
  },
  {
    key: 'cryptopolitan',
    label: 'Cryptopolitan',
    url: 'https://www.cryptopolitan.com/feed/',
    site: 'cryptopolitan.com',
  },
  {
    key: 'journalducoin',
    label: 'Journal du Coin',
    url: 'https://journalducoin.com/feed/',
    site: 'journalducoin.com',
  },
];

/** The servers the news are read from, for the list in About. */
export const NEWS_HOSTS = FEEDS.map(feed => feed.url.split('/')[2]);

export interface Article {
  title: string;
  link: string;
  /** ms since the epoch; 0 when the feed gives no date. */
  at: number;
  summary: string;
  /** The article in blocks; empty when the feed has the summary only. */
  body: Block[];
}

/** A piece of a block's text, bold or not. */
export interface Run {
  text: string;
  bold?: boolean;
}

/** One block of an article: a title, a paragraph, a list item, a quote. */
export interface Block {
  kind: 'title' | 'text' | 'item' | 'quote';
  runs: Run[];
}

/** The text of a block, without its bold. */
export const blockText = (block: Block): string =>
  block.runs.map(run => run.text).join('');

export interface FeedRead {
  at: number;
  articles: Article[];
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  middot: '·',
  bull: '•',
  times: '×',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  icirc: 'î',
  iuml: 'ï',
  ocirc: 'ô',
  ugrave: 'ù',
  ucirc: 'û',
  Eacute: 'É',
};

/** Character references written out, the known names and every number. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X'
          ? parseInt(ref.slice(2), 16)
          : parseInt(ref.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref] ?? whole;
  });
}

const unwrap = (text: string): string =>
  text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

/** The text of a piece of HTML, on one line. */
export function plainText(html: string): string {
  return decodeEntities(
    unwrap(html)
      // A link or a bold word sits inside a sentence: no space added.
      .replace(/<\/?(a|b|strong|em|i|u|span|sup|sub|mark|code)\b[^>]*>/gi, '')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A class the sites give to an advertisement, a call to sign up, or a
 * price widget that only draws on their page.
 */
const AD_CLASS =
  /(^|\s)([\w-]*-)?(cta|ad|ads|advert|advertisement|sponsored|promo|inline-news-ad|cpp-crypto-chart)(-[\w-]*)?(\s|$)/i;
/** What a paid section about a token sale says. */
const PRESALE = /\b(presales?|pre-sales?|pr[ée]-?ventes?)\b/i;
/** The line a feed adds at the end of each article. */
const FEED_FOOTER =
  /^(The post .+ appeared first on .+|L’article .+ est apparu en premier sur .+)$/;
/** Share of a block that, in sponsored links, makes the block an ad. */
const SPONSORED_SHARE = 0.6;
const VOID = /^(img|br|hr|input|source|meta|link|wbr)$/;

/**
 * The blocks of an article. Pictures, scripts, figures and embedded posts
 * are dropped, and so are advertisements: what carries an ad class, a block
 * made mostly of sponsored links, the "appeared first on" line. A heading
 * becomes a title, a list item an item, and the bold words of a sentence
 * stay bold.
 */
export function articleBlocks(html: string): Block[] {
  const cleaned = unwrap(html)
    .replace(
      /<(script|style|figure|iframe|noscript|canvas)\b[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(img|hr)\b[^>]*>/gi, ' ');
  const blocks: Block[] = [];
  let runs: Run[] = [];
  let kind: Block['kind'] = 'text';
  let quotes = 0;
  let bold = 0;
  /** The element being skipped as an ad, and how deep in it. */
  let skip: {name: string; depth: number} | null = null;
  let sponsoredLink = false;
  let sponsored = 0;
  /**
   * After an ad that is a link, the short line that follows it: a site
   * sometimes leaves the end of the ad's sentence outside the link.
   */
  let adTail = false;
  /** Where in the block being read that ad was: what comes before stays. */
  let tailFrom = 0;
  /** Above this length, the line after an ad is taken as the article's. */
  const TAIL = 150;
  /** The runs of the block cut to their first `length` characters. */
  const cut = (length: number) => {
    let left = length;
    runs = runs.flatMap(run => {
      const kept = run.text.slice(0, Math.max(0, left));
      left -= run.text.length;
      return kept === '' ? [] : [{...run, text: kept}];
    });
  };
  const flush = () => {
    let text = runs.map(run => run.text).join('');
    const head = text.slice(0, tailFrom);
    const tailAd =
      adTail && kind === 'text' && text.slice(tailFrom).trim().length < TAIL;
    tailFrom = 0;
    if (tailAd && head.trim() !== '') {
      // The ad sat inside a sentence of the article: only its tail goes.
      cut(head.length);
      text = head;
    }
    const ad =
      sponsored >= text.trim().length * SPONSORED_SHARE ||
      FEED_FOOTER.test(text.trim()) ||
      (tailAd && head.trim() === '');
    sponsored = 0;
    if (text.trim() !== '') {
      adTail = false;
    }
    if (text.trim() !== '' && !ad) {
      runs[0].text = runs[0].text.trimStart();
      runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
      blocks.push({kind, runs: runs.filter(run => run.text !== '')});
    }
    runs = [];
  };
  const add = (raw: string) => {
    const text = decodeEntities(raw).replace(/\s+/g, ' ');
    if (text === '' || (text === ' ' && runs.length === 0)) {
      return;
    }
    if (sponsoredLink) {
      sponsored += text.trim().length;
    }
    const last = runs[runs.length - 1];
    if (last && !!last.bold === bold > 0) {
      last.text = (last.text + text).replace(/ {2,}/g, ' ');
    } else {
      runs.push(bold > 0 ? {text, bold: true} : {text});
    }
  };
  const parts = cleaned.split(/(<[^>]*>)/);
  for (const part of parts) {
    const found = /^<(\/?)([a-z0-9]+)\b/i.exec(part);
    if (skip) {
      if (found && found[2].toLowerCase() === skip.name && !/\/>$/.test(part)) {
        skip.depth += found[1] === '/' ? -1 : 1;
        if (skip.depth === 0) {
          skip = null;
        }
      }
      continue;
    }
    if (!found) {
      add(part);
      continue;
    }
    const closing = found[1] === '/';
    const name = found[2].toLowerCase();
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(part)?.[1] ?? '';
    if (!closing && AD_CLASS.test(classes) && !VOID.test(name)) {
      skip = {name, depth: 1};
      adTail = name === 'a' || name === 'span';
      tailFrom = adTail ? runs.map(run => run.text).join('').length : 0;
      continue;
    }
    if (name === 'a') {
      sponsoredLink = !closing && /\brel\s*=\s*["'][^"']*sponsored/i.test(part);
    } else if (name === 'strong' || name === 'b') {
      bold = Math.max(0, bold + (closing ? -1 : 1));
    } else if (name === 'td' || name === 'th') {
      add(' ');
    } else if (
      /^(p|div|h[1-6]|li|ul|ol|blockquote|br|tr|table|section)$/.test(name)
    ) {
      flush();
      if (name === 'blockquote') {
        quotes = Math.max(0, quotes + (closing ? -1 : 1));
      }
      const inside = quotes > 0 ? 'quote' : 'text';
      kind = closing
        ? inside
        : /^h[1-6]$/.test(name)
        ? 'title'
        : name === 'li'
        ? 'item'
        : inside;
    }
  }
  flush();
  return blocks;
}

/**
 * The article less its last section when that section sells a token sale:
 * some sites end their articles with one.
 */
export function withoutPaidEnd(blocks: Block[]): Block[] {
  let last = -1;
  blocks.forEach((block, i) => {
    if (block.kind === 'title') {
      last = i;
    }
  });
  return last > 0 && blocks.slice(last).some(b => PRESALE.test(blockText(b)))
    ? blocks.slice(0, last)
    : blocks;
}

const tag = (item: string, name: string): string | null => {
  const found = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(
    item,
  );
  return found ? found[1] : null;
};

/** The articles of an RSS feed, newest first. */
export function parseFeed(xml: string): Article[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map(item => {
      const content = tag(item, 'content:encoded');
      const description = tag(item, 'description') ?? '';
      const body = withoutPaidEnd(content ? articleBlocks(content) : []);
      const length = body.reduce((sum, b) => sum + blockText(b).length, 0);
      const date = Date.parse(plainText(tag(item, 'pubDate') ?? ''));
      return {
        title: plainText(tag(item, 'title') ?? ''),
        link: plainText(tag(item, 'link') ?? ''),
        at: isFinite(date) ? date : 0,
        summary: plainText(description),
        // A body no longer than its summary adds nothing.
        body: length > plainText(description).length * 1.5 ? body : [],
      };
    })
    .filter(article => article.title !== '')
    .sort((a, b) => b.at - a.at);
}

/**
 * Whether the summary says something the article does not open with: it is
 * then shown above the article, as its subtitle.
 */
export function hasSubtitle(article: Article): boolean {
  const first = article.body.find(block => block.kind !== 'title');
  const squash = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 60);
  return (
    article.summary !== '' &&
    (!first || !squash(blockText(first)).startsWith(squash(article.summary)))
  );
}

export async function readFeed(feed: Feed): Promise<FeedRead> {
  const xml = await requestText(feed.url);
  return {at: Date.now(), articles: parseFeed(xml)};
}

/** Letters and digits, accented ones too: what a word is made of. */
const WORDY = 'A-Za-z0-9\\u00C0-\\u024F';

/** A word or words of their own in a text: not inside a longer word. */
const asWord = (words: string, flags: string, prefix = ''): RegExp =>
  new RegExp(
    `(^|[^${WORDY}])${prefix}${words.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}([^${WORDY}]|$)`,
    flags,
  );

/**
 * Whether an article speaks of one of the coins, in its title or summary:
 * the name, or a symbol of three letters or more, as words of their own.
 */
export function speaksOf(
  article: Article,
  coins: {symbol: string; name: string}[],
): boolean {
  const text = `${article.title} ${article.summary}`;
  return coins.some(
    coin =>
      (coin.name.length >= 3 && asWord(coin.name, 'i').test(text)) ||
      (coin.symbol.length >= 3 &&
        asWord(coin.symbol.toUpperCase(), '', '\\$?').test(text)),
  );
}
