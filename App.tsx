/**
 * CryptoView: what the user's public addresses hold and what it is worth,
 * read from the network at opening and on demand. Read-only.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, useWindowDimensions, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {TOKEN_CHAINS, TokenChain, tokenChain} from './src/core/chains';
import {fetchCoinList, fetchQuotes, fetchUsdEur} from './src/core/coingecko';
import {
  DOLLARS,
  fmtMoney,
  fmtNumber,
  fmtSigned,
  fmtWhen,
  Money,
} from './src/core/format';
import {HlAccount, mergeHlAccounts} from './src/core/hyperliquid';
import {
  Balances,
  Coin,
  CoinList,
  DEFAULT_SETTINGS,
  EMPTY_BALANCES,
  EMPTY_CACHE,
  EMPTY_LIST,
  Quote,
  normalizeSettings,
  QuoteCache,
  Settings as SettingsData,
} from './src/core/model';
import {
  assetText,
  coinText,
  hlText,
  portfolioText,
  marketText,
  newsText,
  articleText,
  walletText,
} from './src/core/notes';
import {
  COSTS_FILE,
  COSTS_FILE_SHOWN,
  costsFileText,
  parseCostsFile,
} from './src/core/costs';
import {
  isManualCash,
  MANUAL_FILE,
  MANUAL_FILE_SHOWN,
  MANUAL_TEMPLATE,
  manualCoinIds,
  manualFileText,
  manualHoldings,
  manualWallet,
  parseManualFile,
  setManual,
} from './src/core/manual';
import {Article, FEEDS, FeedRead, readFeed, speaksOf} from './src/core/news';
import {buildPortfolio, coinIdsOf, usdRate} from './src/core/portfolio';
import {
  findHeld,
  Holding,
  HYPERLIQUID,
  readAll,
  readTokenInfo,
  sourcesFor,
} from './src/core/readers';
import {
  fetchCoinId,
  fetchContractIds,
  fetchTokenList,
  fillPriceIds,
  mirrorsNative,
  USDC_ID,
  Listed,
  Token,
  TokenList,
  withPriceId,
} from './src/core/tokens';
import {
  normalizeWallets,
  dropFromWalletsFile,
  parseWallets,
  syncWalletsFile,
  Wallet,
  walletKey,
  walletName,
} from './src/core/wallets';
import {copyToNote, currentNote} from './src/note';
import {
  ensureFileRead,
  ensureFileWrite,
  requireInternet,
} from './src/permissions';
import {readJson, readText, writeJson, writeText} from './src/storage';
import {
  Btn,
  Flex,
  loadFonts,
  MiniBtn,
  NavItem,
  P,
  PickedColumns,
  Row,
  Section,
  setUnit,
  Shell,
} from './src/ui/kit';
import {
  chainCols,
  coinCols,
  marketCols,
  partCols,
  portfolioCols,
  shown,
} from './src/core/columns';
import {buildGroups} from './src/core/groups';
import {CoinBox, MarketData} from './src/views/CoinView';
import {AddressView, WalletsTree} from './src/views/WalletsTree';
import {hlFills, HlTab, HyperliquidView} from './src/views/HyperliquidView';
import {Breakdown, PortfolioView} from './src/views/PortfolioView';
import {MarketView} from './src/views/MarketView';
import {Search} from './src/views/Search';
import {ArticleView, NewsView} from './src/views/NewsView';
import {DisplayView, FilesView} from './src/views/Settings';
import {WalletsSettings} from './src/views/WalletsSettings';
import {SupportView} from './src/views/SupportView';
import {Tool, TOOLS, ToolsView} from './src/views/ToolsView';
import {unitsOf} from './src/core/tools';
import {TokensView} from './src/views/TokensView';
import {
  AddWallet,
  WALLETS_FILE,
  WALLETS_FILE_SHOWN,
  WALLETS_TEMPLATE,
} from './src/views/AddressesView';

type Menu =
  | 'portfolio'
  | 'wallets'
  | 'market'
  | 'hyperliquid'
  | 'news'
  | 'tools'
  | 'settings'
  | 'support';
type Screen =
  | Menu
  | 'asset'
  | 'search'
  | 'coin'
  | 'address'
  | 'addresses'
  | 'addWallet'
  | 'tokens'
  | 'files'
  | 'article';

/** The pages of Settings. */
const SETTINGS_PAGES: [Screen, string][] = [
  ['addresses', 'Wallets'],
  ['tokens', 'Chains & tokens'],
  ['settings', 'Display'],
  ['files', 'Import/Export'],
];
const pages = (list: [string, string][]) =>
  list.map(([key, label]) => ({key, label}));
const NAV: NavItem<Menu>[] = [
  {view: 'portfolio', label: 'Portfolio'},
  {view: 'wallets', label: 'Wallets'},
  {view: 'market', label: 'Market'},
  {view: 'hyperliquid', label: 'Hyperliquid'},
  {
    view: 'news',
    label: 'Crypto news',
    pages: FEEDS.map(feed => ({key: feed.key, label: feed.label})),
  },
  {view: 'tools', label: 'Tools', pages: pages(TOOLS)},
  {
    view: 'settings',
    label: 'Settings',
    foot: true,
    pages: pages(SETTINGS_PAGES),
  },
  {view: 'support', label: 'About & support', foot: true},
];
/** The menu entry a screen belongs to. */
const HOME: Record<Screen, Menu> = {
  portfolio: 'portfolio',
  asset: 'portfolio',
  market: 'market',
  search: 'market',
  coin: 'market',
  hyperliquid: 'hyperliquid',
  news: 'news',
  article: 'news',
  wallets: 'wallets',
  address: 'wallets',
  settings: 'settings',
  addresses: 'settings',
  addWallet: 'settings',
  tokens: 'settings',
  files: 'settings',
  tools: 'tools',
  support: 'support',
};

/** What a refresh reads, when not the current state. */
interface RefreshFrom {
  settings: SettingsData;
  wallets: Wallet[];
  pricesOnly?: boolean;
  balancesOnly?: boolean;
}

/**
 * The price ids a refresh reads beside the coins held: those followed, the
 * converter's, the typed ones, and USDC when prices are in euros, as it
 * gives the dollar's worth that a price in dollars, or cash, is turned with.
 */
const wantedIds = (settings: SettingsData): string[] => [
  ...settings.favorites,
  ...settings.converter,
  ...manualCoinIds(settings.manual),
  ...(settings.currency === 'eur' ? [USDC_ID] : []),
];

/** Whether a price the settings need has not been read. */
const pricesMissing = (settings: SettingsData, cache: QuoteCache): boolean =>
  wantedIds(settings).some(id => !cache.quotes[id]) ||
  // Euros typed while prices are in dollars need the euro's worth.
  (settings.currency !== 'eur' &&
    (cache.usdEur ?? null) === null &&
    settings.manual.some(account =>
      account.holdings.some(h => h.coin === 'cash:eur'),
    ));

/** Age after which the list of coins is downloaded again by itself. */
const LIST_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const SETTINGS_FILE = 'settings.json';
const CACHE_FILE = 'cache.json';
const LIST_FILE = 'coins.json';
const WALLETS_STORE = 'wallets.json';
const BALANCES_FILE = 'balances.json';
const HL_FILE = 'hl.json';
/** Where the downloaded token list of a chain is kept. */
const tokensFile = (chainKey: string) => `tokens-${chainKey}.json`;

function App(): React.JSX.Element {
  const {width, height} = useWindowDimensions();
  // The design is 768 x 1024; fit it whichever way the view is constrained.
  setUnit(Math.min(width, (height * 768) / 1024));

  // null while the plugin's fonts and stored data are being loaded.
  const [fontStatus, setFontStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [balances, setBalances] = useState<Balances>(EMPTY_BALANCES);
  const [cache, setCache] = useState<QuoteCache>(EMPTY_CACHE);
  const [list, setList] = useState<CoinList>(EMPTY_LIST);
  const [screen, setScreen] = useState<Screen>('market');
  const [coin, setCoin] = useState<Coin | null>(null);
  const [assetKey, setAssetKey] = useState<string | null>(null);
  // Where the coin page was opened from, for its Back button.
  const [assetFrom, setAssetFrom] = useState<Screen>('portfolio');
  /** The address whose QR code is shown. */
  const [addressShown, setAddressShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [listProgress, setListProgress] = useState('');
  const [chainKey, setChainKey] = useState(TOKEN_CHAINS[0].key);
  const [tokenLists, setTokenLists] = useState<Record<string, TokenList>>({});
  const [tokenProgress, setTokenProgress] = useState('');
  const [pickedToken, setPickedToken] = useState<string | null>(null);
  const [report, setReport] = useState<string[]>([]);
  const [costsReport, setCostsReport] = useState<string[]>([]);
  const [manualReport, setManualReport] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('converter');
  // Where the search and a coin page were opened from, for their Back.
  const [searchFrom, setSearchFrom] = useState<'market' | 'tools'>('market');
  const [coinFrom, setCoinFrom] = useState<'market' | 'search'>('market');
  /** The wallet an address being added joins. */
  const [addressFor, setAddressFor] = useState('');
  /** Whether Chains & tokens was opened from a wallet, for its Back. */
  const [tokensFromWallets, setTokensFromWallets] = useState(false);
  const [newsFeed, setNewsFeed] = useState(FEEDS[0].key);
  const [news, setNews] = useState<Record<string, FeedRead>>({});
  const [newsError, setNewsError] = useState<Record<string, string>>({});
  /** The feeds being read. */
  const [newsReading, setNewsReading] = useState<string[]>([]);
  const newsBusy = newsReading.includes(newsFeed);
  const [newsMine, setNewsMine] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  /** Feeds already read, or being read, since the plugin was opened. */
  const newsAsked = useRef(new Set<string>());
  const [hl, setHl] = useState<Record<string, HlAccount>>({});
  const [hlAddress, setHlAddress] = useState<string | null>(null);
  const [hlTab, setHlTab] = useState<HlTab>('summary');
  // Whether the plugin was opened from a note, which alone can take text.
  const [inNote, setInNote] = useState(false);
  const [notice, setNotice] = useState('');
  const [copying, setCopying] = useState<'' | 'busy' | 'done' | 'failed'>('');
  const [copied, setCopied] = useState('');
  // The latest values, for callbacks that outlive a render.
  const live = useRef({settings, wallets, balances, hl, cache});
  live.current = {settings, wallets, balances, hl, cache};

  // `live` is told at once: a save that follows before the next render must
  // start from this one.
  const saveSettings = useCallback((next: SettingsData) => {
    live.current = {...live.current, settings: next};
    setSettings(next);
    writeJson(SETTINGS_FILE, next);
  }, []);

  const saveBalances = useCallback((next: Balances) => {
    setBalances(next);
    writeJson(BALANCES_FILE, next);
  }, []);

  /** Keeps the amounts of the addresses that are still listed. */
  const saveWallets = useCallback(
    (next: Wallet[]) => {
      live.current = {...live.current, wallets: next};
      setWallets(next);
      writeJson(WALLETS_STORE, next);
      const kept = new Set(next.map(wallet => wallet.address));
      const before = live.current.balances;
      saveBalances({
        ...before,
        holdings: before.holdings.filter(h => kept.has(h.wallet)),
      });
    },
    [saveBalances],
  );

  /**
   * Reads the balances, then the prices of everything held and followed,
   * plus `extra` when a coin outside them is open.
   */
  /** What was read, less the addresses removed while it was being read. */
  const stillHeld = useCallback((holdings: Holding[]): Holding[] => {
    const kept = new Set(live.current.wallets.map(wallet => wallet.address));
    return holdings.filter(holding => kept.has(holding.wallet));
  }, []);

  const runRefresh = useCallback(
    async (extra?: string, from?: RefreshFrom) => {
      const now = from ?? live.current;
      const {currency, skipped} = now.settings;
      let {tokens} = now.settings;
      setBusy(true);
      setError('');
      try {
        await requireInternet();
        const wanted = (holdings: Holding[]) => [
          ...new Set([
            ...wantedIds(now.settings),
            ...coinIdsOf(holdings),
            ...(extra ? [extra] : []),
          ]),
        ];
        /** Reads the prices of `ids`; with `keep`, beside those already read. */
        const readPrices = async (ids: string[], keep: boolean) => {
          setProgress('READING PRICES');
          let quotes: Awaited<ReturnType<typeof fetchQuotes>>;
          try {
            quotes = await fetchQuotes(ids, currency);
          } catch (e) {
            throw new Error(`prices: ${(e as Error).message}`);
          }
          const before = live.current.cache;
          // Euros for a dollar: given by USDC when prices are in euros,
          // asked apart only when a price paid in euros or cash needs it.
          let usdEur = before.usdEur ?? null;
          if (currency === 'eur') {
            usdEur = quotes[USDC_ID]?.price ?? usdEur;
          } else if (
            Object.values(now.settings.costs).some(
              cost => cost.currency === 'eur',
            ) ||
            now.settings.manual.some(account =>
              account.holdings.some(h => h.coin === 'cash:eur'),
            )
          ) {
            usdEur = (await fetchUsdEur().catch(() => null)) ?? usdEur;
          }
          const next: QuoteCache = {
            currency,
            at: Date.now(),
            quotes:
              keep && before.currency === currency
                ? {...before.quotes, ...quotes}
                : quotes,
            usdEur,
          };
          live.current = {...live.current, cache: next};
          setCache(next);
          writeJson(CACHE_FILE, next);
        };
        const readsBalances = now.wallets.length > 0 && !from?.pricesOnly;
        // Prices move all the time and balances seldom: prices come first,
        // so that the total shown is right as soon as possible.
        let pricesFailed: Error | null = null;
        if (!from?.balancesOnly) {
          const ids = wanted(live.current.balances.holdings);
          if (ids.length > 0) {
            try {
              await readPrices(ids, false);
            } catch (e) {
              pricesFailed = e as Error;
            }
          }
        }
        if (readsBalances) {
          // Tokens whose price id is still unknown: one request answers for
          // all of them. If it fails they are asked again at the next
          // refresh.
          const unknown = TOKEN_CHAINS.some(chain =>
            (tokens[chain.key] ?? []).some(
              token => !token.coinId && !token.noPrice,
            ),
          );
          if (unknown) {
            setProgress('LOOKING FOR TOKEN PRICES');
            try {
              const ids = await fetchContractIds();
              // From the tokens as they are now: one may have been added or
              // removed while the table was read.
              tokens = fillPriceIds(live.current.settings.tokens, ids, false);
              saveSettings({...live.current.settings, tokens});
            } catch {}
          }
          const read: Record<string, HlAccount> = {};
          const sources = sourcesFor(now.wallets, tokens, skipped, account => {
            read[account.address] = account;
          });
          setProgress(`READING BALANCES 0/${sources.length}`);
          const result = await readAll(
            sources,
            live.current.balances.holdings,
            (done, total) => setProgress(`READING BALANCES ${done}/${total}`),
          );
          const holdings = stillHeld(result.holdings);
          saveBalances({
            at: Date.now(),
            holdings,
            failed: result.failed,
            sources: result.total,
          });
          const accounts = mergeHlAccounts(
            live.current.wallets.map(wallet => wallet.address),
            read,
            live.current.hl,
          );
          setHl(accounts);
          writeJson(HL_FILE, accounts);
          // A coin this read found has no price yet; after a failure every
          // price is asked again.
          const priced = live.current.cache.quotes;
          const missing = coinIdsOf(holdings).filter(id => !priced[id]);
          if (pricesFailed) {
            pricesFailed = null;
            await readPrices(wanted(holdings), false);
          } else if (missing.length > 0) {
            await readPrices(missing, true);
          }
        }
        if (pricesFailed) {
          throw pricesFailed;
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setProgress('');
        setBusy(false);
      }
    },
    [saveBalances, saveSettings, stillHeld],
  );

  // Reads wait for one another: two at once would each save what it read
  // over the other, and the one started first could win.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => {});
    return next;
  }, []);
  const refresh = useCallback(
    (extra?: string, from?: RefreshFrom) =>
      queued(() => runRefresh(extra, from)),
    [queued, runRefresh],
  );
  /**
   * Reads the prices still missing, after any read going on: what is
   * missing is looked at when its turn comes, on the settings of then.
   */
  const priceMissing = useCallback(
    () =>
      queued(async () => {
        const now = live.current;
        if (pricesMissing(now.settings, now.cache)) {
          await runRefresh(undefined, {...now, pricesOnly: true});
        }
      }),
    [queued, runRefresh],
  );

  /** Reads the Hyperliquid accounts again, and nothing else. */
  const runRefreshHl = useCallback(async () => {
    const now = live.current;
    setBusy(true);
    setError('');
    setProgress('READING HYPERLIQUID');
    try {
      await requireInternet();
      const read: Record<string, HlAccount> = {};
      const isHl = (key: string) => key.startsWith(`${HYPERLIQUID}:`);
      const sources = sourcesFor(
        now.wallets,
        {},
        now.settings.skipped,
        account => {
          read[account.address] = account;
        },
      ).filter(source => isHl(source.key));
      const result = await readAll(
        sources,
        now.balances.holdings.filter(h => isHl(h.source)),
      );
      // On the balances as they are now, not as they were before the read.
      const before = live.current.balances;
      saveBalances({
        ...before,
        holdings: [
          ...before.holdings.filter(h => !isHl(h.source)),
          ...stillHeld(result.holdings),
        ],
        failed: [
          ...before.failed.filter(line => !line.startsWith('Hyperliquid ')),
          ...result.failed,
        ],
      });
      const accounts = mergeHlAccounts(
        live.current.wallets.map(wallet => wallet.address),
        read,
        live.current.hl,
      );
      setHl(accounts);
      writeJson(HL_FILE, accounts);
      if (result.failed.length > 0) {
        setError(result.failed[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress('');
      setBusy(false);
    }
  }, [saveBalances, stillHeld]);
  const refreshHl = useCallback(
    () => queued(runRefreshHl),
    [queued, runRefreshHl],
  );

  /** The download of the list going on, so that two never run at once. */
  const listing = useRef<Promise<Coin[] | null> | null>(null);
  /** Downloads the list of coins; null when it could not be read. */
  const downloadList = useCallback((): Promise<Coin[] | null> => {
    if (listing.current) {
      return listing.current;
    }
    listing.current = (async () => {
      setListProgress('Downloading the list of coins...');
      setError('');
      try {
        await requireInternet();
        const coins = await fetchCoinList((done, total) =>
          setListProgress(
            `Downloading the list of coins: ${done} of ${total}...`,
          ),
        );
        const next: CoinList = {at: Date.now(), coins};
        setList(next);
        writeJson(LIST_FILE, next);
        return coins;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setListProgress('');
        listing.current = null;
      }
    })();
    return listing.current;
  }, []);

  useEffect(() => {
    (async () => {
      const [
        fonts,
        storedSettings,
        storedCache,
        storedList,
        storedWallets,
        storedBalances,
        storedHl,
        note,
      ] = await Promise.all([
        loadFonts(),
        readJson<SettingsData>(SETTINGS_FILE),
        readJson<QuoteCache>(CACHE_FILE),
        readJson<CoinList>(LIST_FILE),
        readJson<Wallet[]>(WALLETS_STORE),
        readJson<Balances>(BALANCES_FILE),
        readJson<Record<string, HlAccount>>(HL_FILE),
        currentNote(),
      ]);
      const loaded = normalizeSettings(storedSettings);
      const loadedWallets = normalizeWallets(storedWallets);
      setSettings(loaded);
      setWallets(loadedWallets);
      // Prices in another currency than the one shown would mislead.
      if (storedCache?.quotes && storedCache.currency === loaded.currency) {
        setCache(storedCache);
      }
      if (Array.isArray(storedList?.coins)) {
        setList(storedList as CoinList);
      }
      if (Array.isArray(storedBalances?.holdings)) {
        setBalances({...EMPTY_BALANCES, ...storedBalances} as Balances);
      }
      if (storedHl && typeof storedHl === 'object') {
        setHl(storedHl);
      }
      setInNote(note !== null);
      if (loadedWallets.length > 0) {
        setScreen('portfolio');
      }
      setFontStatus(fonts);
      live.current = {
        ...live.current,
        settings: loaded,
        wallets: loadedWallets,
      };
      refresh();
      // A list missing, or too old to know the coins of today, is downloaded
      // after the first read: both ask the same server.
      const listAt = Array.isArray(storedList?.coins) ? storedList?.at ?? 0 : 0;
      if (Date.now() - listAt > LIST_MAX_AGE_MS) {
        queued(downloadList);
      }
    })();
  }, [refresh, queued, downloadList]);

  /** Reads one feed again; what was read last stays until it answers. */
  const readNews = useCallback(async (key: string) => {
    const feed = FEEDS.find(one => one.key === key);
    if (!feed) {
      return;
    }
    setNewsReading(keys => [...keys, key]);
    setNewsError(errors => ({...errors, [key]: ''}));
    try {
      await requireInternet();
      const read = await readFeed(feed);
      setNews(all => ({...all, [key]: read}));
      writeJson(`news-${key}.json`, read);
    } catch (e) {
      setNewsError(errors => ({...errors, [key]: (e as Error).message}));
    } finally {
      setNewsReading(keys => keys.filter(one => one !== key));
    }
  }, []);

  // A feed is read the first time its page is opened, not before: the
  // last articles stored are shown meanwhile.
  useEffect(() => {
    if (screen !== 'news' || newsAsked.current.has(newsFeed)) {
      return;
    }
    newsAsked.current.add(newsFeed);
    readJson<FeedRead>(`news-${newsFeed}.json`).then(stored => {
      if (stored && Array.isArray(stored.articles)) {
        setNews(all => (all[newsFeed] ? all : {...all, [newsFeed]: stored}));
      }
    });
    readNews(newsFeed);
  }, [screen, newsFeed, readNews]);

  // The stored token list of a chain is loaded the first time it is shown.
  useEffect(() => {
    if (screen !== 'tokens' || tokenLists[chainKey]) {
      return;
    }
    readJson<TokenList>(tokensFile(chainKey)).then(stored =>
      setTokenLists(lists => ({
        ...lists,
        [chainKey]: Array.isArray(stored?.tokens)
          ? (stored as TokenList)
          : {at: 0, tokens: []},
      })),
    );
  }, [screen, chainKey, tokenLists]);

  const portfolio = useMemo(
    () =>
      buildPortfolio(
        [
          ...balances.holdings,
          ...manualHoldings(settings.manual, cache.usdEur ?? null),
        ],
        cache.quotes,
        usdRate(settings.currency, cache.quotes),
        {
          dust: settings.dust,
          hidden: settings.hidden,
          costs: settings.costs,
          currency: settings.currency,
          usdEur: cache.usdEur ?? null,
        },
      ),
    [balances, cache, settings],
  );
  const money = useMemo((): Money => {
    const rate = usdRate(settings.currency, cache.quotes);
    return rate === null ? DOLLARS : {currency: settings.currency, rate};
  }, [cache, settings.currency]);
  /** Open perp positions of every account, as the portfolio mentions them. */
  const perps = useMemo(
    () =>
      wallets.flatMap(wallet =>
        (hl[wallet.address]?.positions ?? []).map(
          p =>
            `${p.coin} ${p.size >= 0 ? 'long' : 'short'} ${fmtNumber(
              Math.abs(p.size),
            )}` +
            ` ×${p.leverage}, ${fmtMoney(p.value, money)}` +
            ` · PnL ${fmtSigned(p.pnl, money)}`,
        ),
      ),
    [wallets, hl, money],
  );
  /** Their PnL added up, at the top of their card. */
  const perpsPnl = useMemo(() => {
    const all = wallets.flatMap(wallet => hl[wallet.address]?.positions ?? []);
    return all.length === 0
      ? ''
      : fmtSigned(
          all.reduce((sum, p) => sum + p.pnl, 0),
          money,
        );
  }, [wallets, hl, money]);
  const groups = useMemo(
    () => buildGroups(wallets, portfolio, settings.dust, settings.manual),
    [wallets, portfolio, settings.dust, settings.manual],
  );
  /** The lines of the portfolio by coin id, for what Market says of them. */
  const held = useMemo(
    () =>
      Object.fromEntries(
        [...portfolio.lines, ...portfolio.dust].map(line => [line.key, line]),
      ),
    [portfolio],
  );
  const pickedColumns = useMemo(
    () => ({
      picked: settings.columns,
      onPick: (table: string, keys: string[]) =>
        saveSettings({
          ...live.current.settings,
          columns: {...live.current.settings.columns, [table]: keys},
        }),
    }),
    [settings.columns, saveSettings],
  );
  const names = useMemo(
    () =>
      Object.fromEntries([
        ...wallets.map(wallet => [wallet.address, wallet.name]),
        ...settings.manual.map(account => [
          manualWallet(account.name),
          account.name,
        ]),
      ]),
    [wallets, settings.manual],
  );

  // A coin of the portfolio is made a favorite the first time it is seen
  // there, and only then: removed by the user, it stays out.
  useEffect(() => {
    if (fontStatus === null) {
      return;
    }
    const fresh = portfolio.lines
      .map(line => line.key)
      .filter(key => cache.quotes[key] && !settings.offered.includes(key));
    if (fresh.length > 0) {
      const now = live.current.settings;
      saveSettings({
        ...now,
        favorites: [...new Set([...now.favorites, ...fresh])],
        offered: [...new Set([...now.offered, ...fresh])],
      });
    }
  }, [portfolio, cache.quotes, settings, saveSettings, fontStatus]);

  if (fontStatus === null) {
    return <View style={styles.root} />;
  }

  const {currency, favorites} = settings;
  const chain = tokenChain(chainKey) ?? TOKEN_CHAINS[0];
  const followed = settings.tokens[chain.key] ?? [];

  const stale =
    cache.at > 0 ? `PRICES OF ${fmtWhen(cache.at)}` : 'NO PRICE YET';
  const reads =
    wallets.length > 0 && balances.sources > 0
      ? ` · ${balances.sources - balances.failed.length}/${
          balances.sources
        } READS OK`
      : '';
  const status = busy
    ? `${progress}...`
    : notice !== ''
    ? notice
    : error !== ''
    ? `${error.toUpperCase()} · ${stale}`
    : cache.at > 0
    ? `UPDATED ${fmtWhen(cache.at)}${reads}`
    : stale;

  const openCoin = (picked: Coin, from: 'market' | 'search' = 'market') => {
    setCoin(picked);
    setCoinFrom(from);
    setScreen('coin');
    if (!cache.quotes[picked.id]) {
      // One price is missing: the balances are not read again for it.
      refresh(picked.id, {settings, wallets, pricesOnly: true});
    }
  };
  const openSearch = (from: 'market' | 'tools') => {
    setSearchFrom(from);
    setScreen('search');
    if (list.coins.length === 0 && listProgress === '') {
      downloadList();
    }
  };

  /** The typed balances changed; a coin new to them needs a price. */
  const saveManual = (manual: SettingsData['manual']) => {
    saveSettings({...live.current.settings, manual});
    priceMissing();
  };
  const setManualCoin = (
    account: string,
    picked: Coin,
    where: string,
    quantity: number | null,
  ) =>
    saveManual(
      setManual(live.current.settings.manual, account, picked, where, quantity),
    );
  /** Renames typed balances, and the prices paid kept under their name. */
  const renameManual = (from: string, to: string) => {
    const now = live.current.settings;
    const prefix = `${manualWallet(from)}|`;
    const costs = Object.fromEntries(
      Object.entries(now.costs).map(([key, cost]) => [
        key.startsWith(prefix)
          ? `${manualWallet(to)}|${key.slice(prefix.length)}`
          : key,
        cost,
      ]),
    );
    saveSettings({
      ...now,
      costs,
      manual: now.manual.map(account =>
        account.name === from ? {...account, name: to} : account,
      ),
    });
  };
  /** Stops reading an address; it leaves the addresses file too. */
  const removeAddress = (key: string) => {
    saveWallets(live.current.wallets.filter(w => walletKey(w) !== key));
    // Out of the file too, or the next import would bring it back.
    (async () => {
      try {
        if ((await ensureFileRead()) && (await ensureFileWrite())) {
          const text = await readText(WALLETS_FILE);
          if (text.trim() !== '') {
            await writeText(WALLETS_FILE, dropFromWalletsFile(text, key));
          }
        }
      } catch {}
    })();
  };
  /** A new name for a wallet: its addresses and its typed balances. */
  const renameWallet = (from: string, to: string) => {
    const before = live.current.wallets;
    if (before.some(w => walletName(w) === from)) {
      const next = before.map(w =>
        walletName(w) === from ? {...w, name: to} : w,
      );
      saveWallets(next);
      syncFile(next);
    }
    renameManual(from, to);
  };
  /** One address into another wallet, existing or new. */
  const moveAddress = (key: string, to: string) => {
    const next = live.current.wallets.map(w =>
      walletKey(w) === key ? {...w, name: to} : w,
    );
    saveWallets(next);
    syncFile(next);
  };
  /** A wallet gone: its addresses, out of the file too, and its balances. */
  const deleteWallet = (name: string) => {
    const gone = live.current.wallets.filter(w => walletName(w) === name);
    const kept = live.current.wallets.filter(w => walletName(w) !== name);
    saveWallets(kept);
    (async () => {
      try {
        if ((await ensureFileRead()) && (await ensureFileWrite())) {
          let text = await readText(WALLETS_FILE);
          if (text.trim() !== '') {
            for (const wallet of gone) {
              text = dropFromWalletsFile(text, walletKey(wallet));
            }
            await writeText(WALLETS_FILE, text);
          }
        }
      } catch {}
    })();
    // The prices paid of its typed balances go with them: a wallet made
    // later under the same name must not find them again.
    const now = live.current.settings;
    const prefix = `${manualWallet(name)}|`;
    saveSettings({
      ...now,
      manual: now.manual.filter(a => a.name !== name),
      costs: Object.fromEntries(
        Object.entries(now.costs).filter(([key]) => !key.startsWith(prefix)),
      ),
    });
  };
  const exportManual = async () => {
    try {
      if (!(await ensureFileWrite())) {
        throw new Error('permission to write files refused');
      }
      const {manual} = live.current.settings;
      await writeText(MANUAL_FILE, manualFileText(manual, list.coins));
      const count = manual.reduce((sum, a) => sum + a.holdings.length, 0);
      setManualReport([`${count} holdings written to ${MANUAL_FILE_SHOWN}.`]);
    } catch (e) {
      setManualReport([`Export failed: ${(e as Error).message}.`]);
    }
  };
  const importManual = async () => {
    try {
      if (!(await ensureFileRead())) {
        throw new Error('permission to read files refused');
      }
      // Coins are known by the list: without one, it is downloaded first.
      const coins =
        list.coins.length > 0 ? list.coins : (await downloadList()) ?? [];
      if (coins.length === 0) {
        throw new Error('the list of coins could not be downloaded');
      }
      const parsed = parseManualFile(
        await readText(MANUAL_FILE),
        coins,
        Date.now(),
        live.current.wallets.map(walletName),
      );
      const problems = parsed.problems;
      if (problems.length > 0) {
        setManualReport(['Nothing changed:', ...problems]);
        return;
      }
      const count = parsed.accounts.reduce((n, a) => n + a.holdings.length, 0);
      setManualReport([
        `${parsed.accounts.length} accounts, ${count} holdings read.`,
        ...parsed.notes,
      ]);
      saveManual(parsed.accounts);
    } catch (e) {
      setManualReport([`Import failed: ${(e as Error).message}.`]);
    }
  };

  const exportCosts = async () => {
    try {
      if (!(await ensureFileWrite())) {
        throw new Error('permission to write files refused');
      }
      await writeText(
        COSTS_FILE,
        costsFileText(portfolio, settings.costs, names),
      );
      setCostsReport([
        `${
          Object.keys(settings.costs).length
        } prices written to ${COSTS_FILE_SHOWN}.`,
      ]);
    } catch (e) {
      setCostsReport([`Export failed: ${(e as Error).message}.`]);
    }
  };
  const importCosts = async () => {
    try {
      if (!(await ensureFileRead())) {
        throw new Error('permission to read files refused');
      }
      const parsed = parseCostsFile(await readText(COSTS_FILE));
      const keys = Object.keys(parsed.costs);
      if (keys.length === 0 && parsed.problems.length === 0) {
        setCostsReport([`No price found in ${COSTS_FILE_SHOWN}.`]);
        return;
      }
      const before = live.current.settings.costs;
      const changed = keys.filter(
        key =>
          before[key]?.price !== parsed.costs[key].price ||
          before[key]?.currency !== parsed.costs[key].currency,
      ).length;
      setCostsReport([
        `${keys.length} prices read, ${changed} new or changed.`,
        ...parsed.problems,
      ]);
      if (changed > 0) {
        saveSettings({
          ...live.current.settings,
          costs: {...before, ...parsed.costs},
        });
      }
    } catch (e) {
      setCostsReport([`Import failed: ${(e as Error).message}.`]);
    }
  };

  const importFile = async () => {
    try {
      if (!(await ensureFileRead())) {
        throw new Error('permission to read files refused');
      }
      const text = await readText(WALLETS_FILE);
      if (text.trim() === '') {
        setReport([`Nothing found in ${WALLETS_FILE_SHOWN}.`]);
        return;
      }
      const parsed = parseWallets(text);
      const known = new Set(wallets.map(walletKey));
      const inFile = new Map(parsed.wallets.map(w => [walletKey(w), w]));
      const added = parsed.wallets.filter(w => !known.has(walletKey(w)));
      // The file decides the name and the pools of an address already listed.
      let renamed = 0;
      const kept = wallets.map(w => {
        const now = inFile.get(walletKey(w));
        if (
          !now ||
          (now.name === w.name && String(now.pools) === String(w.pools))
        ) {
          return w;
        }
        renamed++;
        return {...w, name: now.name, ...(now.pools ? {pools: now.pools} : {})};
      });
      setReport([
        `${added.length} added, ${renamed} renamed, ` +
          `${parsed.wallets.length - added.length - renamed} unchanged.` +
          (added.length > 0
            ? ' Reading them now, and searching their tokens (see Settings,' +
              ' Wallets).'
            : ''),
        ...parsed.problems,
      ]);
      if (added.length > 0 || renamed > 0) {
        saveWallets([...kept, ...added]);
      }
      if (added.length > 0) {
        // New addresses are read at once, with the prices of what they hold;
        // their tokens are searched for too, which reads them again after.
        refresh();
        if (added.some(w => TOKEN_CHAINS.some(c => c.family === w.family))) {
          findTokens();
        }
      }
    } catch (e) {
      setReport([`Import failed: ${(e as Error).message}.`]);
    }
  };

  /**
   * Brings the addresses file in line with the list after a change made on
   * the tablet. Best effort: without the file or the permission, the list
   * kept by the plugin is still right.
   */
  const syncFile = async (next: Wallet[]) => {
    try {
      if ((await ensureFileRead()) && (await ensureFileWrite())) {
        const text = await readText(WALLETS_FILE);
        await writeText(
          WALLETS_FILE,
          syncWalletsFile(text.trim() === '' ? WALLETS_TEMPLATE : text, next),
        );
      }
    } catch {}
  };

  /** Writes a new file; never replaces one that already holds something. */
  const createIn = async (
    file: string,
    shown: string,
    text: () => string,
    say: (lines: string[]) => void,
  ) => {
    try {
      if (!(await ensureFileRead()) || !(await ensureFileWrite())) {
        throw new Error('permission to read and write files refused');
      }
      if ((await readText(file)).trim() !== '') {
        say([`${shown} already exists. It was left as it is.`]);
        return;
      }
      await writeText(file, text());
      say([
        `Created ${shown}. Fill it in from a computer, then tap "Import data".`,
      ]);
    } catch (e) {
      say([`File not created: ${(e as Error).message}.`]);
    }
  };
  /** The addresses file made to hold the addresses listed, and only them. */
  const exportAddresses = async () => {
    try {
      if (!(await ensureFileRead()) || !(await ensureFileWrite())) {
        throw new Error('permission to read and write files refused');
      }
      const listed = live.current.wallets;
      const before = await readText(WALLETS_FILE);
      let text = syncWalletsFile(
        before.trim() === '' ? WALLETS_TEMPLATE : before,
        listed,
      );
      const kept = new Set(listed.map(walletKey));
      for (const wallet of parseWallets(text).wallets) {
        if (!kept.has(walletKey(wallet))) {
          text = dropFromWalletsFile(text, walletKey(wallet));
        }
      }
      await writeText(WALLETS_FILE, text);
      setReport([
        `${listed.length} addresses written to ${WALLETS_FILE_SHOWN}.`,
      ]);
    } catch (e) {
      setReport([`Export failed: ${(e as Error).message}.`]);
    }
  };

  /**
   * The price id of a contract. When the question itself fails, the id stays
   * unknown and is asked again at a later refresh.
   */
  const priceOf = async (
    onChain: TokenChain,
    address: string,
  ): Promise<Pick<Token, 'coinId' | 'noPrice'>> => {
    try {
      const coinId = await fetchCoinId(onChain, address);
      return coinId ? {coinId} : {coinId: null, noPrice: true};
    } catch {
      return {coinId: null};
    }
  };

  /** Prices are read again in the new currency; balances are kept. */
  const switchCurrency = (next: SettingsData['currency']) => {
    if (next !== currency && !busy) {
      const changed = {...settings, currency: next};
      saveSettings(changed);
      setCache({...EMPTY_CACHE, usdEur: cache.usdEur});
      refresh(screen === 'coin' ? coin?.id : undefined, {
        settings: changed,
        wallets,
        pricesOnly: true,
      });
    }
  };

  /** Writes the figures of a view on the page of the open note. */
  const copy = async (text: string) => {
    setCopying('busy');
    try {
      if (!(await ensureFileWrite())) {
        throw new Error('file permission refused');
      }
      await copyToNote(text);
      setCopying('done');
      // Back to the note, where the text now is.
      setTimeout(() => {
        setCopying('');
        PluginManager.closePluginView();
      }, 700);
    } catch (e) {
      setCopying('failed');
      setNotice(`NOT COPIED: ${(e as Error).message.toUpperCase()}`);
      setTimeout(() => {
        setCopying('');
        setNotice('');
      }, 5000);
    }
  };
  /**
   * `part` names the block a small button copies, when a page has several:
   * only the button tapped then says how the copy went.
   */
  const copyButton = (text: () => string | null, part?: string) => {
    const state = part === undefined || copied === part ? copying : '';
    const Button = part === undefined ? Btn : MiniBtn;
    return (
      <Button
        label={
          state === 'busy'
            ? 'Copying...'
            : state === 'done'
            ? '✓ Copied'
            : state === 'failed'
            ? 'Not copied'
            : inNote || part !== undefined
            ? 'Copy to note'
            : 'Copy to note: open from a note'
        }
        disabled={!inNote}
        selected={state !== ''}
        onPress={() => {
          const made = copying === '' ? text() : null;
          if (made) {
            setCopied(part ?? '');
            copy(made);
          }
        }}
      />
    );
  };

  const setFollowed = (next: Token[]) =>
    saveSettings({
      ...settings,
      tokens: {...settings.tokens, [chain.key]: next},
    });

  /** A token joins the chain's bucket once its price id is known. */
  const addToken = async (
    symbol: string,
    make: () => Promise<Omit<Token, 'coinId'> | null>,
  ) => {
    setTokenProgress(`Adding ${symbol}...`);
    try {
      await requireInternet();
      const token = await make();
      if (!token) {
        throw new Error(`not a token on ${chain.name}`);
      }
      const price = await priceOf(chain, token.address);
      if (mirrorsNative(chain, {...token, ...price})) {
        throw new Error(`it is ${chain.native} itself, already counted`);
      }
      const current = live.current.settings;
      saveSettings({
        ...current,
        tokens: {
          ...current.tokens,
          [chain.key]: [
            ...(current.tokens[chain.key] ?? []),
            {...token, ...price},
          ],
        },
      });
      setTokenProgress('');
    } catch (e) {
      setTokenProgress(`Could not add ${symbol}: ${(e as Error).message}.`);
      setTimeout(() => setTokenProgress(''), 4000);
    }
  };

  const refreshLists = async () => {
    const chains = TOKEN_CHAINS.filter(c => !settings.skipped.includes(c.key));
    const problems: string[] = [];
    try {
      await requireInternet();
      for (let i = 0; i < chains.length; i++) {
        setTokenProgress(
          `Downloading the token lists: ${i + 1} of ${chains.length} (${
            chains[i].name
          })...`,
        );
        try {
          const next: TokenList = {
            at: Date.now(),
            tokens: await fetchTokenList(chains[i]),
          };
          await writeJson(tokensFile(chains[i].key), next);
          setTokenLists(lists => ({...lists, [chains[i].key]: next}));
        } catch (e) {
          problems.push(`${chains[i].name}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
    setTokenProgress(
      problems.length > 0 ? `Not downloaded: ${problems.join('; ')}.` : '',
    );
    if (problems.length > 0) {
      setTimeout(() => setTokenProgress(''), 6000);
    }
  };

  /** The stored list of a chain, downloaded when the tablet has none. */
  const listOf = async (key: string): Promise<TokenList> => {
    const have =
      tokenLists[key] ?? (await readJson<TokenList>(tokensFile(key)));
    if (Array.isArray(have?.tokens) && have.tokens.length > 0) {
      return have;
    }
    const next: TokenList = {
      at: Date.now(),
      tokens: await fetchTokenList(tokenChain(key)!),
    };
    await writeJson(tokensFile(key), next);
    setTokenLists(lists => ({...lists, [key]: next}));
    return next;
  };

  /**
   * Searches every chain for the listed tokens the addresses hold, and adds
   * them to the buckets. Nothing is ever removed.
   */
  const findTokens = async () => {
    // The addresses as they are now: an import may have just added some.
    const now = live.current;
    const chains = TOKEN_CHAINS.filter(
      c =>
        !now.settings.skipped.includes(c.key) &&
        now.wallets.some(wallet => wallet.family === c.family),
    );
    const problems: string[] = [];
    const added: string[] = [];
    let priceIds: Map<string, string> | null = null;
    // Every save starts from the tokens as they are at that moment: the
    // search takes minutes, and one may be added or removed meanwhile.
    const saveTokens = (
      change: (tokens: SettingsData['tokens']) => SettingsData['tokens'],
    ) =>
      saveSettings({
        ...live.current.settings,
        tokens: change(live.current.settings.tokens),
      });
    try {
      await requireInternet();
      // Tokens followed without a price are looked up again on the way.
      setTokenProgress('Reading the table of prices...');
      priceIds = await fetchContractIds().catch(() => null);
      if (priceIds) {
        const ids = priceIds;
        saveTokens(tokens => fillPriceIds(tokens, ids, true));
      }
      for (const c of chains) {
        try {
          setTokenProgress(`Searching ${c.name}: reading the list...`);
          const known = (await listOf(c.key)).tokens;
          const found = new Map<string, Listed>();
          for (const wallet of now.wallets.filter(w => w.family === c.family)) {
            const held = await findHeld(
              c,
              wallet.address,
              known,
              (done, total) =>
                setTokenProgress(
                  `Searching ${c.name} for ${
                    wallet.name || 'an address'
                  }: ${done} of ${total}...`,
                ),
            );
            held.forEach(token => found.set(token[0], token));
          }
          // Saved chain by chain: a later failure loses nothing. Without
          // the table the tokens are still added; their prices are looked
          // for again at the next refresh.
          saveTokens(tokens => {
            const mine = tokens[c.key] ?? [];
            const followed = new Set(mine.map(token => token.address));
            const fresh: Token[] = [...found.values()]
              .filter(token => !followed.has(token[0]))
              .map(token => ({
                symbol: token[1],
                name: token[2],
                decimals: token[3],
                ...(priceIds
                  ? withPriceId(c, {address: token[0]}, priceIds)
                  : {address: token[0], coinId: null}),
              }))
              .filter(token => !mirrorsNative(c, token));
            added.push(...fresh.map(token => `${token.symbol} (${c.name})`));
            return {...tokens, [c.key]: [...mine, ...fresh]};
          });
        } catch (e) {
          problems.push(`${c.name}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
    setTokenProgress(
      (added.length > 0
        ? `Added ${added.length}: ${added.join(', ')}.`
        : 'No new token found.') +
        (problems.length > 0 ? ` Not searched: ${problems.join('; ')}.` : ''),
    );
    setTimeout(() => setTokenProgress(''), 8000);
    refresh();
  };

  const shownGroup = groups.find(group =>
    group.addresses.some(a => a.address === addressShown),
  );
  const shownAddress = shownGroup?.addresses.find(
    a => a.address === addressShown,
  );

  let title: string;
  let body: React.ReactNode;
  let action: React.ReactNode;
  let titleAction: React.ReactNode;
  const assetLine =
    screen === 'asset'
      ? [
          ...portfolio.lines,
          ...portfolio.dust,
          ...portfolio.unpriced,
          ...portfolio.hidden,
        ].find(l => l.key === assetKey)
      : undefined;

  const toggleFavorite = (id: string) =>
    saveSettings({
      ...settings,
      favorites: favorites.includes(id)
        ? favorites.filter(other => other !== id)
        : [...favorites, id],
    });
  const favoriteButton = (id: string) => {
    const isFavorite = favorites.includes(id);
    return (
      <MiniBtn
        label={isFavorite ? '★ Favorite' : '☆ Favorite'}
        selected={isFavorite}
        onPress={() => toggleFavorite(id)}
      />
    );
  };
  const toggleConverter = (id: string) =>
    saveSettings({
      ...settings,
      converter: settings.converter.includes(id)
        ? settings.converter.filter(other => other !== id)
        : [...settings.converter, id],
    });
  /** Back from a page where coins were picked: they need a price. */
  const backTo = (to: 'market' | 'tools' | 'search') => {
    setScreen(to);
    priceMissing();
  };
  const backButton = (to: 'market' | 'tools' | 'search') => (
    <Btn label={`Back to ${to}`} onPress={() => backTo(to)} />
  );
  /** The figures of the price source, as one part of a page. */
  const marketData = (quote: Quote | undefined) =>
    quote && (
      <>
        <Section title="Market data" note="from CoinGecko">
          {copyButton(() => coinText(quote, currency, cache.at), 'market')}
        </Section>
        <MarketData quote={quote} currency={currency} />
      </>
    );

  if (screen === 'coin' && coin) {
    title = coin.name;
    titleAction = favoriteButton(coin.id);
    const mine = [...portfolio.lines, ...portfolio.dust].find(
      l => l.key === coin.id,
    );
    body = (
      <>
        <CoinBox
          quote={cache.quotes[coin.id]}
          currency={currency}
          held={mine}
        />
        {marketData(cache.quotes[coin.id])}
      </>
    );
    action = backButton(coinFrom);
  } else if (screen === 'search') {
    title = 'Find a coin';
    body = (
      <Search
        list={list}
        loading={listProgress}
        favorites={favorites}
        onFavorite={toggleFavorite}
        converter={settings.converter}
        onConverter={toggleConverter}
        onPick={picked => openCoin(picked, 'search')}
      />
    );
    action = (
      <Row>
        <Flex>{backButton(searchFrom)}</Flex>
        {list.coins.length === 0 && (
          <Flex>
            <Btn
              label="Download list"
              primary
              disabled={listProgress !== ''}
              onPress={downloadList}
            />
          </Flex>
        )}
      </Row>
    );
  } else if (screen === 'asset' && assetLine) {
    const quote = cache.quotes[assetLine.key];
    const isHidden = settings.hidden.includes(assetLine.key);
    title = assetLine.name;
    titleAction = (
      <>
        {quote && favoriteButton(assetLine.key)}
        <MiniBtn
          label="Spam"
          selected={isHidden}
          onPress={() =>
            saveSettings({
              ...settings,
              hidden: isHidden
                ? settings.hidden.filter(key => key !== assetLine.key)
                : [...settings.hidden, assetLine.key],
            })
          }
        />
      </>
    );
    body = (
      <>
        <CoinBox
          quote={quote}
          currency={currency}
          symbol={assetLine.symbol}
          held={assetLine}
        />
        {isHidden && <P>Marked as spam: not counted in the portfolio.</P>}
        <Section title="Balances on chain">
          {copyButton(
            () =>
              assetText(
                assetLine,
                currency,
                balances.at,
                shown(
                  partCols({line: assetLine, names, currency}),
                  settings.columns.asset,
                ),
              ),
            'balances',
          )}
        </Section>
        <Breakdown
          line={assetLine}
          names={names}
          currency={currency}
          onCost={(key, cost) => {
            const costs = {...settings.costs};
            if (cost) {
              costs[key] = cost;
            } else {
              delete costs[key];
            }
            saveSettings({...settings, costs});
          }}
          onManual={setManualCoin}
        />
        {marketData(quote)}
      </>
    );
    action = (
      <Btn
        label={
          assetFrom === 'wallets' ? 'Back to wallets' : 'Back to portfolio'
        }
        onPress={() => setScreen(assetFrom)}
      />
    );
  } else if (screen === 'portfolio' || screen === 'asset') {
    title = 'Portfolio';
    body = (
      <PortfolioView
        portfolio={portfolio}
        balances={balances}
        pricesAt={cache.at}
        error={error}
        busy={busy}
        onBalances={() =>
          refresh(undefined, {settings, wallets, balancesOnly: true})
        }
        onPrices={() =>
          refresh(undefined, {settings, wallets, pricesOnly: true})
        }
        currency={currency}
        hasWallets={wallets.length > 0 || settings.manual.length > 0}
        perps={perps}
        perpsPnl={perpsPnl}
        quotes={cache.quotes}
        names={names}
        onOpen={line => {
          setAssetKey(line.key);
          setAssetFrom('portfolio');
          setScreen('asset');
        }}
      />
    );
    action =
      wallets.length === 0 ? (
        <Btn
          label="Add an address"
          primary
          onPress={() => setScreen('addresses')}
        />
      ) : (
        copyButton(() =>
          portfolioText(
            portfolio,
            currency,
            balances.at,
            shown(
              portfolioCols({
                currency,
                quotes: cache.quotes,
                total: portfolio.total,
                names,
              }),
              settings.columns.portfolio,
            ),
          ),
        )
      );
  } else if (screen === 'addWallet') {
    title = 'Add an address';
    body = (
      <AddWallet
        existing={wallets}
        name={addressFor}
        onCancel={() => setScreen('addresses')}
        onSave={wallet => {
          const next = [...wallets, wallet];
          saveWallets(next);
          syncFile(next);
          setReport([]);
          setScreen('addresses');
          refresh(undefined, {settings, wallets: next});
          if (TOKEN_CHAINS.some(c => c.family === wallet.family)) {
            findTokens();
          }
        }}
      />
    );
    action = undefined;
  } else if (screen === 'address' && shownGroup && shownAddress) {
    title = 'Address';
    body = <AddressView address={shownAddress} wallet={shownGroup.name} />;
    action = (
      <Btn label="Back to wallets" onPress={() => setScreen('wallets')} />
    );
  } else if (screen === 'wallets' || screen === 'address') {
    title = 'Wallets';
    body = (
      <WalletsTree
        groups={groups}
        currency={currency}
        total={portfolio.total}
        quotes={cache.quotes}
        onAddress={address => {
          setAddressShown(address);
          setScreen('address');
        }}
        onManual={setManualCoin}
        onCoin={line => {
          setAssetKey(line);
          setAssetFrom('wallets');
          setScreen('asset');
        }}
        copy={(group, open) =>
          copyButton(
            () =>
              walletText(group, open, currency, balances.at, {
                chains: one =>
                  shown(
                    chainCols({group: one, currency}),
                    settings.columns.chains,
                  ),
                coins: chain =>
                  shown(
                    coinCols({chain, currency, quotes: cache.quotes}),
                    settings.columns.coins,
                  ),
              }),
            `wallet:${group.name}`,
          )
        }
      />
    );
    action =
      wallets.length === 0 ? (
        <Btn
          label="Add an address"
          primary
          onPress={() => setScreen('addresses')}
        />
      ) : undefined;
  } else if (screen === 'addresses') {
    title = 'Settings · Wallets';
    body = (
      <WalletsSettings
        wallets={wallets}
        accounts={settings.manual}
        list={list}
        onAddAddress={name => {
          setAddressFor(name);
          setScreen('addWallet');
        }}
        onRemoveAddress={removeAddress}
        onMoveAddress={moveAddress}
        onTokens={family => {
          setChainKey(family === 'solana' ? 'solana' : 'ethereum');
          setPickedToken(null);
          setTokensFromWallets(true);
          setScreen('tokens');
        }}
        onAddWallet={name =>
          saveManual([
            ...live.current.settings.manual,
            {name, at: Date.now(), holdings: []},
          ])
        }
        onRename={renameWallet}
        onDelete={deleteWallet}
        onSetBalance={setManualCoin}
        alreadyRead={(name, coinId, chainName) =>
          balances.holdings.some(
            h =>
              h.coinId === coinId &&
              h.chain === chainName &&
              wallets.some(
                w => w.address === h.wallet && walletName(w) === name,
              ),
          )
        }
        report={tokenProgress !== '' ? [tokenProgress, ...report] : report}
      />
    );
    action = (
      <Btn
        label="Find my tokens"
        disabled={tokenProgress !== '' || wallets.length === 0}
        onPress={findTokens}
      />
    );
  } else if (screen === 'tokens') {
    const picked = followed.find(token => token.address === pickedToken);
    const skipped = settings.skipped.includes(chain.key);
    title = 'Settings · Chains & tokens';
    body = (
      <TokensView
        chain={chain}
        onChain={key => {
          setChainKey(key);
          setPickedToken(null);
        }}
        skipped={skipped}
        followed={followed}
        picked={pickedToken}
        onPick={setPickedToken}
        list={tokenLists[chain.key] ?? null}
        progress={tokenProgress}
        onAdd={(listed: Listed) =>
          addToken(listed[1], async () => ({
            address: listed[0],
            symbol: listed[1],
            name: listed[2],
            decimals: listed[3],
          }))
        }
        onAddContract={address =>
          addToken('the contract', async () => {
            const info = await readTokenInfo(chain, address);
            return info && {address, name: info.symbol, ...info};
          })
        }
      />
    );
    action = (
      <>
        {tokensFromWallets && (
          <Btn
            label="Back to wallets"
            onPress={() => {
              setTokensFromWallets(false);
              setScreen('addresses');
            }}
          />
        )}
        <Row>
          <Flex>
            <Btn
              label="Refresh lists"
              disabled={tokenProgress !== ''}
              onPress={refreshLists}
            />
          </Flex>
          <Flex>
            <Btn
              label={skipped ? `Read ${chain.name}` : `Skip ${chain.name}`}
              onPress={() =>
                saveSettings({
                  ...settings,
                  skipped: skipped
                    ? settings.skipped.filter(key => key !== chain.key)
                    : [...settings.skipped, chain.key],
                })
              }
            />
          </Flex>
        </Row>
        {picked && (
          <Btn
            label={`Stop reading ${picked.symbol}`}
            onPress={() => {
              setFollowed(
                followed.filter(token => token.address !== pickedToken),
              );
              setPickedToken(null);
            }}
          />
        )}
      </>
    );
  } else if (screen === 'hyperliquid') {
    const accounts = wallets
      .map(wallet => hl[wallet.address])
      .filter((account): account is HlAccount => !!account);
    // With several accounts the view opens on all of them together.
    const shown =
      accounts.find(a => a.address === hlAddress) ??
      (accounts.length > 1 ? undefined : accounts[0]);
    title = 'Hyperliquid';
    body = (
      <HyperliquidView
        accounts={accounts}
        names={names}
        current={shown?.address ?? null}
        onAccount={setHlAddress}
        tab={hlTab}
        onTab={setHlTab}
        hasEvmWallet={wallets.some(wallet => wallet.family === 'evm')}
        money={money}
      />
    );
    action = (
      <Row>
        <Flex>
          <Btn
            label={busy ? 'Reading...' : 'Refresh Hyperliquid only'}
            disabled={busy}
            onPress={refreshHl}
          />
        </Flex>
        {shown && (
          <Flex>
            {copyButton(() =>
              hlText(
                shown,
                hlTab,
                names[shown.address] ?? '',
                money,
                hlFills.get(shown.address),
              ),
            )}
          </Flex>
        )}
      </Row>
    );
  } else if (screen === 'settings') {
    title = 'Settings · Display';
    body = (
      <DisplayView
        currency={currency}
        onCurrency={switchCurrency}
        dust={settings.dust}
        onDust={dust => saveSettings({...settings, dust})}
      />
    );
  } else if (screen === 'files') {
    title = 'Settings · Import/Export';
    body = (
      <FilesView
        addressesFile={WALLETS_FILE_SHOWN}
        onCreateAddresses={() =>
          createIn(
            WALLETS_FILE,
            WALLETS_FILE_SHOWN,
            () => WALLETS_TEMPLATE,
            setReport,
          )
        }
        onImportAddresses={importFile}
        onExportAddresses={exportAddresses}
        addressesReport={report}
        balancesFile={MANUAL_FILE_SHOWN}
        onCreateBalances={() =>
          createIn(
            MANUAL_FILE,
            MANUAL_FILE_SHOWN,
            () => MANUAL_TEMPLATE,
            setManualReport,
          )
        }
        onExportBalances={exportManual}
        onImportBalances={importManual}
        balancesReport={manualReport}
        costsFile={COSTS_FILE_SHOWN}
        costs={Object.keys(settings.costs).length}
        onCreateCosts={() =>
          createIn(
            COSTS_FILE,
            COSTS_FILE_SHOWN,
            () => costsFileText(portfolio, settings.costs, names),
            setCostsReport,
          )
        }
        onExportCosts={exportCosts}
        onImportCosts={importCosts}
        costsReport={costsReport}
        list={list}
        loading={listProgress}
        onRefreshList={downloadList}
      />
    );
  } else if (screen === 'tools') {
    title = 'Tools';
    const dollar = usdRate(currency, cache.quotes);
    const usdEur = cache.usdEur ?? null;
    body = (
      <ToolsView
        tool={tool}
        currency={currency}
        waiting={settings.converter
          .filter(id => !cache.quotes[id])
          .map(id => ({
            id,
            symbol:
              list.coins.find(c => c.id === id)?.symbol.toUpperCase() ?? id,
          }))}
        onRemove={toggleConverter}
        onAdd={() => openSearch('tools')}
        units={unitsOf(
          settings.converter,
          cache.quotes,
          currency === 'eur'
            ? 1
            : usdEur !== null && usdEur > 0
            ? 1 / usdEur
            : null,
          dollar,
        )}
      />
    );
  } else if (screen === 'news' || (screen === 'article' && article)) {
    const feed = FEEDS.find(one => one.key === newsFeed) ?? FEEDS[0];
    const read = news[feed.key];
    if (screen === 'article' && article) {
      title = feed.label;
      body = <ArticleView feed={feed} article={article} />;
      action = (
        <Row>
          <Flex>
            <Btn label="Back to the news" onPress={() => setScreen('news')} />
          </Flex>
          <Flex>{copyButton(() => articleText(feed.label, article))}</Flex>
        </Row>
      );
    } else {
      const coins = [
        // Cash is no coin: "Euro" would find every article on Europe.
        ...portfolio.lines.filter(line => !line.parts.every(isManualCash)),
        ...favorites.flatMap(id =>
          cache.quotes[id] ? [cache.quotes[id]] : [],
        ),
      ];
      const listed = (read?.articles ?? []).filter(
        one => !newsMine || speaksOf(one, coins),
      );
      title = `News · ${feed.label}`;
      body = (
        <NewsView
          feed={feed}
          read={read}
          error={newsError[feed.key] ?? ''}
          busy={newsBusy}
          mine={newsMine}
          onMine={setNewsMine}
          shown={listed}
          onOpen={one => {
            setArticle(one);
            setScreen('article');
          }}
        />
      );
      action =
        listed.length > 0
          ? copyButton(() => newsText(feed.label, listed, read!.at))
          : undefined;
    }
  } else if (screen === 'support') {
    title = 'About';
    body = <SupportView fontStatus={fontStatus} />;
  } else {
    title = 'Market';
    body = (
      <MarketView
        favorites={favorites}
        quotes={cache.quotes}
        currency={currency}
        held={held}
        onOpen={id => {
          const quote = cache.quotes[id];
          openCoin(quote ?? {id, symbol: id.toUpperCase(), name: id, rank: 0});
        }}
      />
    );
    action = (
      <Row>
        <Flex>
          <Btn
            label="Find a coin"
            primary
            onPress={() => openSearch('market')}
          />
        </Flex>
        <Flex>
          {copyButton(() =>
            marketText(
              favorites.map(id => ({id, quote: cache.quotes[id]})),
              cache.at,
              shown(marketCols({currency, held}), settings.columns.market),
            ),
          )}
        </Flex>
      </Row>
    );
  }

  return (
    <PickedColumns.Provider value={pickedColumns}>
      <View style={styles.root}>
        <Shell
          nav={NAV.filter(
            item =>
              item.view !== 'hyperliquid' ||
              screen === 'hyperliquid' ||
              wallets.some(wallet => hl[wallet.address]),
          )}
          current={
            screen === 'asset'
              ? HOME[assetFrom]
              : screen === 'search'
              ? searchFrom
              : HOME[screen]
          }
          onNav={view => {
            setTokensFromWallets(false);
            setScreen(view);
          }}
          page={
            screen === 'tools'
              ? tool
              : HOME[screen] === 'news'
              ? newsFeed
              : screen
          }
          onPage={(view, page) => {
            if (view === 'tools') {
              setTool(page as Tool);
            } else if (view === 'news') {
              setNewsFeed(page);
              setScreen('news');
            } else {
              setTokensFromWallets(false);
              setScreen(page as Screen);
            }
          }}
          status={status}
          busy={busy || newsBusy}
          onRefresh={() =>
            HOME[screen] === 'news'
              ? readNews(newsFeed)
              : refresh(screen === 'coin' ? coin?.id : undefined)
          }
          onExit={() => PluginManager.closePluginView()}
          currency={currency === 'eur' ? '€ EUR' : '$ USD'}
          onCurrency={() => switchCurrency(currency === 'eur' ? 'usd' : 'eur')}
          title={title}
          titleAction={titleAction}
          action={action}>
          {HOME[screen] === 'settings' && screen !== 'addWallet' && (
            <Row>
              {SETTINGS_PAGES.map(([page, label]) => (
                <Flex key={page}>
                  <Btn
                    label={label}
                    selected={page === screen}
                    onPress={() => setScreen(page)}
                  />
                </Flex>
              ))}
            </Row>
          )}
          {body}
        </Shell>
      </View>
    </PickedColumns.Provider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
});

export default App;
