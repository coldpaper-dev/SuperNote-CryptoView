# CryptoView

A read-only crypto viewer for Supernote tablets (Manta, Nomad). You give it
public addresses; it reads what they hold from public nodes, prices it, and
shows the value of your portfolio on the e-ink screen.

CryptoView holds no key. It cannot sign, send, swap or connect to anything.

<img src="docs/screenshots/portfolio.png" width="260" alt="Portfolio"> <img src="docs/screenshots/wallets.png" width="260" alt="Wallets"> <img src="docs/screenshots/hyperliquid-summary.png" width="260" alt="Hyperliquid">

The [user manual](docs/MANUAL.md) walks through every page, with
screenshots.

## Install

Download CryptoView from InkHub. Or download `CryptoView-<version>.snplg`
from the
[releases](https://github.com/coldpaper-dev/SuperNote-CryptoView/releases),
copy it to the `MyStyle` folder of the Supernote, and install it from
Settings > Apps > Plugins. To upgrade, install the new version over the old
one: your data is kept. Right after an upgrade, give the Supernote a few
seconds to reload its plugins before opening CryptoView; opened too early, it
may be reported as not compatible.

## What it shows

- **Portfolio** - the total, its change over 24 hours, 7 days and 30 days,
  and one line per coin with quantity, price, value and gain. Tap a column
  title to sort, a line to see where the coins are and set the price you
  paid.
- **Wallets** - the same holdings by wallet. A wallet is every address that
  carries the same name. Tap a wallet to unfold its chains, a chain to
  unfold its coins; each address has its QR code. Coins under the dust
  threshold are not listed here.
- **Market** - the coins you follow, with their rank, their change over 24
  hours, 7 days and 30 days and their volume. A coin of your portfolio is
  added to them the first time it is read; remove it and it stays out. Tap a coin for every change from 1 hour to 1 year, a chart,
  volume, supply, all-time high and low, and a description on demand. "Find a
  coin" lists the 1,000 largest coins, largest first, and searches them;
  tap the star of a coin to follow it, its box to add it to the converter.
  The coins you hold are in bold.
- **Hyperliquid** - shown when one of your EVM addresses has an account, in
  the words of the exchange: account value and PnL over time, margin,
  leverage, PnL and volume by period (perps apart); open positions (HIP-3
  markets included) with distance to liquidation and funding; spot balances,
  total and available; HYPE staking; supply, borrow and vaults; open orders;
  the last 20 trades, read when you ask. With several accounts, a first page
  adds them up.
- **Crypto news** - the articles of Cryptonews, Cryptopolitan and Journal
  du Coin (in French), read from their public feeds when you open one. All
  three put the whole article in the feed, so it reads on the Supernote; a QR
  code opens it on a phone. "About my coins" keeps the articles that name a
  coin you hold or follow.
- **Tools** - three calculators that read nothing from the network: a
  converter between euro, dollar and the coins you add to it (from
  "Find a coin"), the average
  price of several buys, and the liquidation price of a leveraged position.
- **Settings** - four pages: Wallets (each wallet with its addresses and
  its typed balances), Chains & tokens (what is read on each chain), Display
  (currency, dust threshold) and Import/Export (the three text files, each
  with Create file, Import data and Export data, and the list of coins,
  downloaded again by itself when it is more than 30 days old).
- **About & support** - what CryptoView is, its permissions and the servers
  it talks to; where to ask for help or suggest an addition, and how to
  thank the author.

The title line of each table has a small columns button: pick what you want
to see, and each column shows its place, which is the order you picked them
in. A column is as wide as its longest text. The first column stays in place
and the others slide sideways under the finger when they do not fit. "Copy
to note" writes the columns you picked.

"Copy to note" writes the figures of a view, dated, on the page of the note
CryptoView was opened from, so you can annotate them by hand.

## Chains

| Chain | What is read |
| --- | --- |
| Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BNB Chain, HyperEVM | Native coin and the tokens you follow |
| Hyperliquid | The whole account (see above) |
| Solana | SOL and the tokens you follow |
| Bitcoin | Confirmed balance of an address (legacy, P2SH, SegWit, Taproot) |
| NEAR | NEAR, and the staking pools you name |
| Injective, Fetch.ai, Cosmos Hub, Osmosis | Native coin, free and staked; USDT and USDC on Injective |

One EVM address is read on every EVM chain and on Hyperliquid.

### Tokens

A chain cannot say which tokens an address holds: each token has to be asked
for. CryptoView reads only the tokens in your list for each chain.

- **Find my tokens** (in Settings, Wallets) downloads the token lists, asks every listed
  token once, and adds the ones your addresses hold. Run it once, and again
  after you receive a new token.
- The lists hold more than 25,000 tokens over the EVM chains and Solana.
- You can also add a token by symbol, by name or by contract address, and
  remove one, in Chains & tokens. A token that is in no list can be added by its
  contract address, so there is no limit to what you can follow.
- A chain can be switched off; it is then not contacted at all.

USDC is always counted as one US dollar.

## The addresses file

`MyStyle/Plugins/CryptoView/wallets.txt`, one address per line:

```
# chain, address, name
evm, 0x0000000000000000000000000000000000000000, Main wallet
btc, bc1q..., Cold storage
sol, ..., Solana
near, myname.near, Near, mypool.poolv1.near
inj, inj1..., Injective
```

The chain can be left out when the address says it. Chains: `evm`, `btc`,
`sol`, `near`, `inj`, `fet`, `atom`, `osmo`. For NEAR, a fourth part lists
staking pools, separated by spaces; pools are also looked up for you.
"Create file" in Settings, Import/Export writes an empty one; "Import
data" reads it, and the file decides the name of each address; "Export
data" writes the addresses listed on the Supernote. Renaming a
wallet or adding an address on the Supernote rewrites the file to match.

Public addresses only. A line that looks like a seed phrase or a private key
is refused and never stored.

## Typed balances

A wallet is a name: the addresses carrying it, and the balances you type
for it in Settings, Wallets. Type what CryptoView cannot read - an account
at an exchange, a position in a protocol, cash - or a wallet with no
address at all. A balance is a coin of the search list (the 1,000 largest),
or euros or dollars, on a chain the plugin reads or Off-chain; the price
comes from the market. Typed balances sit in Wallets on lines marked
"typed", join their coin's line in the portfolio, and take a price paid
like any holding. Tap a typed quantity in Wallets or on a coin's page to
change it. A coin that an address of the same wallet already holds on that
chain would be counted twice: the plugin says so when you type it.

`MyStyle/Plugins/CryptoView/holdings.txt` keeps them, one balance per line:

```
# wallet, chain, coin, quantity, note
Kraken, Off-chain, BTC, 0.25
Main wallet, Arbitrum, ETH, 2, Aave
Bank, Off-chain, EUR, 1500
```

The coin is its symbol, or its CoinGecko id when several coins share the
symbol (the largest is taken otherwise, and the import says so). Import
replaces every typed balance, and changes nothing if a line cannot be read.

## The prices paid file

`MyStyle/Plugins/CryptoView/costs.txt` keeps what you paid for one coin of
each holding, apart from the addresses. In Settings, Import/Export, "Export
data" writes one line per holding, priced or not:

```
# coin, chain, wallet, price, currency, key
LINK, Ethereum, Main wallet, 12.5, eur, ethereum:0x...|chainlink|
SDL, Ethereum, Main wallet, 0, eur, ethereum:0x...|stake-link|
```

Fill in the price (with a dot) and the currency (`eur` or `usd`) from a
computer, leave the key as it is, then tap "Import data". A line with no
price is ignored. Export replaces the file.

## What leaves the Supernote, goes where and why

CryptoView has no server of its own. The Supernote talks directly to public
services, with no API key:

- to read prices and coin lists: `api.coingecko.com`, `tokens.coingecko.com`
- to read balances on EVM chains: `*.publicnode.com`, `rpc.hyperliquid.xyz`
- to read the Hyperliquid account: `api.hyperliquid.xyz`
- to read Bitcoin balances: `blockstream.info`, `mempool.space`
- to read Solana balances: `api.mainnet-beta.solana.com`
- to read NEAR balances: `rpc.mainnet.near.org`, and `api.fastnear.com` to
  find staking pools
- to read Cosmos chains: `*.publicnode.com`, `lcd.injective.network`,
  `rest-fetchhub.fetch.ai`, `lcd.osmosis.zone`
- to read news, only when a feed is opened: `cryptonews.com`,
  `www.cryptopolitan.com`, `journalducoin.com`

Each of them sees your network address and the public addresses it is asked
about, and can tell that addresses asked together belong together. The
complete list is on the About & support page of the plugin.

Nothing else leaves the Supernote. Your wallet names, typed balances, prices
paid, favorites and the last amounts read are stored in the plugin's private
folder on the Supernote, in clear, nowhere else. Anyone who opens the
Supernote can see them.

## Permissions

You can refuse any of them:

- **Internet** - to read balances, prices and news. Without it nothing new is
  read; the last figures stored are shown.
- **Read files** - to import your addresses, typed balances and prices paid
  from text files. Without it, type them on the Supernote.
- **Write files** - to export them, and for "Copy to note". Without it, both
  are unavailable.

## Limits

- Prices are indications from CoinGecko, not quotes to trade on.
- Nothing refreshes in the background: figures are read when the plugin opens
  and when you tap Refresh. A read that fails keeps its last amount, marked
  with `*`, and the total says it is partial.
- Not read: transaction history, NFTs, positions inside DeFi protocols,
  Hyperliquid sub-accounts, extended public keys (xpub).
- On Injective, Fetch.ai, Cosmos Hub and Osmosis only the chain's own coin
  is read, free and staked (plus USDT and USDC on Injective): tokens that
  came from another chain (IBC), pool shares, coins being unstaked and
  unclaimed rewards are not.
- A token named USDC counts as one dollar only when its contract is USDC
  or one of its known bridged forms; any other is priced on its own.

## Simplifications

CryptoView reads balances, not transactions, so some figures are estimates:

- **Changes of the total over 24 hours, 7 days and 30 days** assume you held
  the same coins all along: only prices move. A deposit, a withdrawal or a
  trade made in the period is not seen.
- **PnL** is the value now minus the price you typed for each holding (your
  average buying price, per coin). It does not follow your trades: after
  buying or selling, correct the price yourself. A coin with no price typed
  is left out, and the line is marked `~`. A price of 0 is a coin received
  for free: all of its value is PnL, with no percentage. The PnL of the
  total is the sum of these gains, and its percentage is that sum over
  everything paid. For Hyperliquid spot balances the
  price recorded by the exchange is used until you type one.
- **A price typed in the other currency** is converted at today's rate, not
  the rate of the day you bought.
- **Staked and wrapped forms** (jupSOL, wstETH, WBTC...) are shown on the
  line of their coin. Each is valued at its own price; the quantity added to
  the line is that value divided by the price of the coin, so the factor
  follows the market at each refresh.
- **USDC always counts as one US dollar.**
- **A perp position** appears in the portfolio through its margin (USDC),
  with a mention under the USDC line; the exposure itself is in the
  Hyperliquid view.

## Roadmap

- **Several references for the PnL**: up to three sets of prices paid,
  named by the user (average cost, current cost, tax year...), one of them
  filled from the price of each coin at a chosen date. Open question: the
  balance held at that date is not known to a viewer that reads no history.

## Build

Requires Node 18+, a JDK 21 and the Android SDK.

```
npm install
npm test
JAVA_HOME=/path/to/jdk-21 ANDROID_HOME=/path/to/Android/Sdk npm run build:plugin
```

The package is written to `build/outputs/CryptoView-<version>.snplg`. Copy it
to the Supernote's `MyStyle` folder and install it from Settings > Apps >
Plugins.

`LIVE=1 npx jest __tests__/live` runs the readers against the real public
servers.

## Fonts

Silkscreen and IBM Plex Mono, both under the SIL Open Font License; the
licence texts are in `assets/fonts`.

## Libraries

QR codes are made on the Supernote with `qrcode-generator` (MIT).

## Help and ideas

CryptoView is fully open source (MIT license): anyone can read and audit its
code. A question, a bug, or something you would like CryptoView to do? Open an
issue: https://github.com/coldpaper-dev/SuperNote-CryptoView/issues. Pull
requests to adapt or develop it are welcome.

## Support

CryptoView is free, with no ads and no tracking. If it is useful to you, you
can buy me a coffee:

- Ethereum mainnet, Arbitrum or HyperEVM:
  `0x9a39eD99E82825b75aC636DcF6D851C9ee0CDC97`
- Solana: `4oZejAJqp71aehyjQwZ4PKgWmaLneA53TBAAmKz9ARXS`

The same addresses, with their QR codes, are at the bottom of the About &
support page of the plugin.
