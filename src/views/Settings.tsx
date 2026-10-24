import React from 'react';
import {balanceHosts} from '../core/chains';
import {HOSTS} from '../core/coingecko';
import {HL_HOSTS} from '../core/hyperliquid';
import {NEWS_HOSTS} from '../core/news';
import {TOKEN_HOSTS} from '../core/tokens';
import {fmtWhen} from '../core/format';
import {CoinList, Currency, DUST_CHOICES} from '../core/model';
import {Btn, Flex, H2, Label, Option, P, Row, Rule, Small} from '../ui/kit';

/** How figures are shown: the currency and the dust threshold. */
export function DisplayView(props: {
  currency: Currency;
  onCurrency: (currency: Currency) => void;
  dust: number;
  onDust: (dust: number) => void;
}) {
  const {currency} = props;
  return (
    <>
      <Label>Currency</Label>
      <Option
        title="Euro"
        selected={currency === 'eur'}
        onPress={() => props.onCurrency('eur')}>
        <Small>Prices and values in EUR.</Small>
      </Option>
      <Option
        title="US dollar"
        selected={currency === 'usd'}
        onPress={() => props.onCurrency('usd')}>
        <Small>Prices and values in USD.</Small>
      </Option>
      <Rule />
      <Label>Dust</Label>
      <Row>
        {DUST_CHOICES.map(choice => (
          <Flex key={choice}>
            <Btn
              label={
                choice === 0
                  ? 'None'
                  : `${currency === 'eur' ? '€' : '$'}${choice}`
              }
              selected={choice === props.dust}
              onPress={() => props.onDust(choice)}
            />
          </Flex>
        ))}
      </Row>
      <Small>
        A coin worth less than this is folded into the "Dust" line of the
        portfolio. It still counts in the total.
      </Small>
    </>
  );
}

/** One text file the plugin reads or writes, and its three buttons. */
function FileBlock(props: {
  title: string;
  file: string;
  what: string;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  report: string[];
}) {
  return (
    <>
      <Label>{props.title}</Label>
      <P>{props.file}</P>
      <Small>{props.what}</Small>
      <Row>
        <Flex>
          <Btn label="Create file" onPress={props.onCreate} />
        </Flex>
        <Flex>
          <Btn label="Import data" onPress={props.onImport} />
        </Flex>
        <Flex>
          <Btn label="Export data" onPress={props.onExport} />
        </Flex>
      </Row>
      {props.report.map(line => (
        <Small key={line}>{line}</Small>
      ))}
    </>
  );
}

/**
 * Everything that goes in or out through a file, in one place, and the
 * list of coins the searches offer.
 */
export function FilesView(props: {
  addressesFile: string;
  onCreateAddresses: () => void;
  onImportAddresses: () => void;
  onExportAddresses: () => void;
  addressesReport: string[];
  balancesFile: string;
  onCreateBalances: () => void;
  onImportBalances: () => void;
  onExportBalances: () => void;
  balancesReport: string[];
  costsFile: string;
  /** How many prices paid are typed. */
  costs: number;
  onCreateCosts: () => void;
  onImportCosts: () => void;
  onExportCosts: () => void;
  costsReport: string[];
  list: CoinList;
  loading: string;
  onRefreshList: () => void;
}) {
  const {list} = props;
  return (
    <>
      <P>
        Each file can be filled in from a computer, then imported. They outlive
        the plugin: export them before removing it, import them after.
      </P>
      <Small>
        Create file writes a new file and never replaces one. Export data
        replaces the file with what the plugin holds. Import data replaces what
        the plugin holds with the file.
      </Small>
      <Rule />
      <FileBlock
        title="Addresses"
        file={props.addressesFile}
        what={
          'One address per line: chain, address, wallet name. Changing an ' +
          'address on the Supernote rewrites the file too.'
        }
        onCreate={props.onCreateAddresses}
        onImport={props.onImportAddresses}
        onExport={props.onExportAddresses}
        report={props.addressesReport}
      />
      <Rule />
      <FileBlock
        title="Typed balances"
        file={props.balancesFile}
        what={
          'One balance per line: wallet, chain, coin, quantity and a note if ' +
          'you like. An import changes nothing if a line cannot be read.'
        }
        onCreate={props.onCreateBalances}
        onImport={props.onImportBalances}
        onExport={props.onExportBalances}
        report={props.balancesReport}
      />
      <Rule />
      <FileBlock
        title="Prices paid"
        file={props.costsFile}
        what={
          `${props.costs} typed. The file has one line per holding, priced ` +
          'or not. Import takes every line that has a price; the others ' +
          'change nothing.'
        }
        onCreate={props.onCreateCosts}
        onImport={props.onImportCosts}
        onExport={props.onExportCosts}
        report={props.costsReport}
      />
      <Rule />
      <Label>List of coins</Label>
      <P>
        {props.loading !== ''
          ? props.loading
          : list.coins.length === 0
          ? 'Not downloaded yet.'
          : `${list.coins.length} coins, downloaded ${fmtWhen(list.at)}.`}
      </P>
      <Small>
        The searches and the typed balances only know coins of this list: the
        largest by market capitalisation. It is downloaded again by itself when
        it is more than 30 days old.
      </Small>
      <Btn
        label="Refresh list"
        disabled={props.loading !== ''}
        onPress={props.onRefreshList}
      />
    </>
  );
}

/** What CryptoView is, what it may do, and who it talks to. */
export function AboutView({fontStatus}: {fontStatus: string}) {
  return (
    <>
      <H2>CryptoView is a blockchain viewer.</H2>
      <P>
        It reads the balances of your public addresses on each chain, prices
        them, and shows your portfolio by coin and by wallet. Add what the
        chains cannot tell (an exchange account, a position, cash) and what you
        paid, to follow your PnL.
      </P>
      <P>
        Also: market data from CoinGecko, your Hyperliquid account, crypto news,
        a converter, an average price and a liquidation price. "Copy to note"
        writes any view into your note.
      </P>
      <P>
        It holds no private key and cannot sign, send or swap: it is NOT a
        wallet. It only reads public data.
      </P>
      <Label>Permissions</Label>
      <P>You can refuse any of them:</P>
      <Small>
        Internet: to read balances, prices and news. Without it nothing new is
        read; the last figures stored are shown.
      </Small>
      <Small>
        Read files: to import your addresses, balances and prices paid from text
        files. Without it, type them on the Supernote.
      </Small>
      <Small>
        Write files: to export them, and for "Copy to note". Without it, both
        are unavailable.
      </Small>
      <Label>What leaves the Supernote, goes where and why</Label>
      <P>
        Each server below sees your network address and the public addresses it
        is asked about.
      </P>
      <Small>
        To read prices and coin lists: {[...HOSTS, ...TOKEN_HOSTS].join(', ')}.
      </Small>
      <Small>
        To read balances:{' '}
        {[...new Set([...balanceHosts(), ...HL_HOSTS])].join(', ')}.
      </Small>
      <Small>
        To read news, when a feed is opened: {NEWS_HOSTS.join(', ')}.
      </Small>
      <Small>
        Prices by CoinGecko. They are indications, not quotes to trade on.
      </Small>
      <P>
        Nothing else leaves the Supernote: your wallet names, typed balances,
        prices paid, favorites and the last amounts read are kept on it, nowhere
        else.
      </P>
      {fontStatus !== '' && <Small>System font in use: {fontStatus}.</Small>}
    </>
  );
}
