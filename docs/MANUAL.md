# CryptoView user manual

CryptoView shows what your public addresses hold, priced, on the screen of
a Supernote. It reads public data only: it holds no key and cannot
send anything. This manual walks through every page.

The screenshots come from a real portfolio.

## Contents

1. [First opening](#first-opening)
2. [Add your wallets](#add-your-wallets)
3. [Portfolio](#portfolio)
4. [Wallets](#wallets)
5. [A coin's page](#a-coins-page)
6. [Market](#market)
7. [Hyperliquid](#hyperliquid)
8. [Crypto news](#crypto-news)
9. [Tools](#tools)
10. [Settings](#settings)
11. [About & support](#about--support)
12. [Everywhere](#everywhere)

## First opening

Download CryptoView from InkHub. Or copy `CryptoView-x.y.z.snplg`, from the
[releases](https://github.com/coldpaper-dev/Supernote-CryptoView/releases),
to the `MyStyle` folder of the Supernote and install it from Settings > Apps >
Plugins. Open it from a note.

The Supernote asks for the network: CryptoView needs it to read prices and
balances. It then asks for the files when you import or export. You can
refuse; the [About page](#about--support) says what stops working without
each permission.

<img src="screenshots/permission-network.png" width="420" alt="Network permission">

Every opening reads everything again. The title line says when, and how many
reads succeeded; **Refresh** reads again, and the currency button switches
between euro and dollar.

## Add your wallets

A wallet is a name: the addresses it holds, and the balances you type for
it. Create one in **Settings, Wallets**, then add its public addresses. Never
type a seed phrase or a private key: CryptoView refuses them, and has no use
for them.

<img src="screenshots/settings-wallets.png" width="420" alt="Settings, Wallets">

You can also write the addresses on a computer, in
`MyStyle/Plugins/CryptoView/wallets.txt`, and tap **Import data** in
**Settings, Import/Export**. The plugin then reads them at once, and searches
their tokens.

<img src="screenshots/import-result.png" width="420" alt="An import of addresses">

A chain cannot tell which tokens an address holds. **Find my tokens**, at the
bottom of Settings, Wallets, asks every token of the public lists (more than
25,000 on the EVM chains and Solana) and keeps the ones you hold. Run it once,
and again after you receive a new token.

## Portfolio

The total, its PnL and its change over 24 hours, 7 days and 30 days, then one
line per coin. The two dated boxes say when the balances and the prices were
read. Open Hyperliquid perps are listed above the coins.

<img src="screenshots/portfolio.png" width="420" alt="Portfolio">

Tap a column title to sort by it, a line to open the coin. The PnL counts
only the coins whose price paid you gave; a `~` says it is partial.

## Wallets

The same holdings by wallet. Tap a wallet to unfold its chains, a chain to
unfold its coins. **QR** shows an address in full with its QR code, to watch
it or send to it from a phone. Coins under the dust threshold are left out.

<img src="screenshots/wallets.png" width="420" alt="Wallets, unfolded">

## A coin's page

What you hold of the coin and its gain, then the market data from CoinGecko:
a chart over 24 hours, 7 days, 30 days or a year, every change from 1 hour to
200 days, market cap, volume, supply, all-time high and low, and a
description.

<img src="screenshots/coin-detail.png" width="420" alt="A coin's page"> <img src="screenshots/coin-facts.png" width="420" alt="A coin's facts">

**Favorite** adds the coin to the Market page. **Spam** marks a token you
never asked for: it is no longer counted, and sits in a folded "Spam" line
at the bottom of the portfolio.

The page also lists where the coin sits, address by address, with the price
you paid for each holding. Tap **set** to type that price. A typed balance
can be changed or removed from here.

<img src="screenshots/coin-typed-balance.png" width="420" alt="Balances of a coin, one being changed">

## Market

The coins you follow: price, change over 24 hours, 7 days and 30 days, rank
and volume. The coins you hold are in bold. Tap a line for the coin's page.

<img src="screenshots/market.png" width="420" alt="Market">

**Find a coin** lists the 1,000 largest coins and searches them by symbol or
name. The star follows a coin; the box adds it to the converter.

<img src="screenshots/find-a-coin.png" width="420" alt="Find a coin">

## Hyperliquid

Shown when one of your EVM addresses has a Hyperliquid account, in the words
of the exchange. **Summary** gives the account value, spot, staking, perps
equity, margin, leverage and the closest liquidation, with the account value
or PnL over time.

<img src="screenshots/hyperliquid-summary.png" width="420" alt="Hyperliquid, summary">

**Perps** lists the open positions, closest to liquidation first, with their
PnL, entry, margin, liquidation price and funding. **Spot**, **Staking**,
**Earn** and **Open orders** follow; **Trade history** reads the last 20
trades when you ask.

<img src="screenshots/hyperliquid-perps.png" width="420" alt="Hyperliquid, perps"> <img src="screenshots/hyperliquid-trades.png" width="420" alt="Hyperliquid, trade history">

## Crypto news

Three public feeds: Cryptonews, Cryptopolitan and Journal du Coin (in
French). A feed is read only when you open it. **About my coins** keeps the
articles that name a coin you hold or follow.

<img src="screenshots/news.png" width="420" alt="News">

The whole article reads on the Supernote; a QR code opens it on a phone.

<img src="screenshots/news-article.png" width="420" alt="An article">

## Tools

Three calculators that read nothing from the network.

**Converter**: type an amount on any line, the others follow at the prices
last read. **Add a coin** adds a line.

<img src="screenshots/tools-converter.png" width="420" alt="Converter">

**Average price**: one line per buy, quantity and price of one. The average is
what to type as the price paid of a holding.

<img src="screenshots/tools-average-price-empty.png" width="420" alt="Average price, empty"> <img src="screenshots/tools-average-price.png" width="420" alt="Average price, filled">

**Leverage**: the liquidation price of an isolated position, long or short,
as Hyperliquid computes it.

<img src="screenshots/tools-leverage.png" width="420" alt="Leverage">

## Settings

**Wallets**: your wallets, their addresses and typed balances; **Find my
tokens** (see [Add your wallets](#add-your-wallets)).

**Chains & tokens**: what is read on each chain. Tap a token to stop reading
it, add one by symbol, name or contract address, or skip a whole chain.

<img src="screenshots/settings-chains-tokens.png" width="420" alt="Settings, Chains & tokens">

**Display**: euro or dollar, and the dust threshold under which a coin is
folded into a "Dust" line.

<img src="screenshots/settings-display.png" width="420" alt="Settings, Display">

**Import/Export**: three text files in `MyStyle/Plugins/CryptoView/`, which
survive removing the plugin:

- `wallets.txt`: your addresses, one per line;
- `holdings.txt`: your typed balances;
- `costs.txt`: the prices you paid.

Each has three buttons. **Create file** writes an empty file and never
replaces one. **Export data** writes what the plugin holds. **Import data**
replaces what the plugin holds with the file. Export them before you remove
the plugin, and import them after. The [README](../README.md) gives the
format of each file.

The list of coins is downloaded again by itself when it is more than 30 days
old; **Refresh list** downloads it now.

<img src="screenshots/settings-import-export.png" width="420" alt="Settings, Import/Export">

## About & support

**About**: what CryptoView is, its permissions, and what leaves the
Supernote, where and why: every server it talks to sees only your network
address and the public addresses it is asked about. Your wallet names, typed
balances, prices paid and favorites stay on the Supernote.

<img src="screenshots/about.png" width="420" alt="About">

**Help and ideas**: CryptoView is fully open source (MIT license), so anyone
can read and audit its code. For a question, a bug or an idea, open an issue
on the project's page; pull requests are welcome.

**Support**: if CryptoView is useful to you, the addresses to buy the author
a coffee are at the bottom.

<img src="screenshots/support.png" width="420" alt="Help and ideas, and Support">

## Everywhere

- **Columns**: the small button in the title line of a table picks the
  columns to show, in the order you pick them.
- **Copy to note** writes the figures of the page, dated, on the note
  CryptoView was opened from, then closes the plugin, so you can annotate
  them by hand.
- **Exit** closes the plugin.
