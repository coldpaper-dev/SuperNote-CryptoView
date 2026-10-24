import React, {useMemo, useState} from 'react';
import {TOKEN_CHAINS, TokenChain} from '../core/chains';
import {fmtWhen} from '../core/format';
import {
  Listed,
  priceIdOf,
  searchTokens,
  Token,
  tokenAddress,
  TokenList,
} from '../core/tokens';
import {shortAddress} from '../core/wallets';
import {
  Btn,
  Column,
  Field,
  Flex,
  Label,
  P,
  Row,
  Small,
  TableHead,
  TableRow,
} from '../ui/kit';

const SHOWN = 10;
const FOLLOWED: Column[] = [
  {label: '', flex: 0.2},
  {label: 'Symbol', flex: 1, bold: true},
  {label: 'Name', flex: 2},
  {label: 'Price', flex: 0.8, right: true},
];
const FOUND: Column[] = [
  {label: 'Symbol', flex: 1, bold: true},
  {label: 'Name', flex: 2},
  {label: 'Contract', flex: 1.4, right: true},
];
const ROWS = [0, 3, 6];

interface Props {
  chain: TokenChain;
  onChain: (key: string) => void;
  skipped: boolean;
  followed: Token[];
  /** Address of the token picked for removal, or null. */
  picked: string | null;
  onPick: (address: string | null) => void;
  /** null while the stored list of this chain is being loaded. */
  list: TokenList | null;
  /** What is going on, '' when nothing is. */
  progress: string;
  onAdd: (listed: Listed) => void;
  /** Adds a token that is in no list, from its contract address. */
  onAddContract: (address: string) => void;
}

/**
 * The tokens read on one chain. A chain cannot list what an address holds,
 * so only the tokens chosen here are asked for. "Find my tokens", in Wallets,
 * fills the buckets by asking the whole list once.
 */
export function TokensView(props: Props) {
  const {chain, followed, list} = props;
  const [typed, setTyped] = useState('');
  const found = useMemo(
    () => searchTokens(list?.tokens ?? [], typed, SHOWN),
    [list, typed],
  );
  const mine = new Set(followed.map(token => token.address));
  const asAddress = tokenAddress(chain, typed);
  const isAddress =
    chain.family === 'evm'
      ? /^0x[0-9a-f]{40}$/.test(asAddress)
      : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asAddress);
  return (
    <>
      {ROWS.map(start => (
        <Row key={start}>
          {TOKEN_CHAINS.slice(start, start + 3).map(option => (
            <Flex key={option.key}>
              <Btn
                label={option.name}
                selected={option.key === chain.key}
                onPress={() => {
                  setTyped('');
                  props.onChain(option.key);
                }}
              />
            </Flex>
          ))}
        </Row>
      ))}
      <Label>
        Read on {chain.name}
        {props.skipped ? ' (chain switched off)' : ''}
      </Label>
      <TableHead columns={FOLLOWED} />
      <TableRow
        columns={FOLLOWED}
        cells={['', chain.native, 'Native coin, always read', 'yes']}
      />
      {followed.map(token => (
        <TableRow
          key={token.address}
          columns={FOLLOWED}
          onPress={() =>
            props.onPick(props.picked === token.address ? null : token.address)
          }
          cells={[
            props.picked === token.address ? '>' : '',
            token.symbol,
            token.name,
            priceIdOf(token) ? 'yes' : token.noPrice ? 'no' : 'later',
          ]}
        />
      ))}
      <Small>
        "Find my tokens", in Wallets, searches every chain for the listed
        tokens your addresses hold and adds them here. Tap a token to stop
        reading it. Price "later": not found yet, asked again at the next
        refresh.
      </Small>
      <Label>Add a token</Label>
      {props.progress !== '' ? (
        <P>{props.progress}</P>
      ) : list === null ? (
        <P>Loading the list...</P>
      ) : (
        <>
          <Field
            value={typed}
            onChangeText={setTyped}
            placeholder={
              list.tokens.length === 0
                ? 'Contract address'
                : 'Symbol, name or contract address'
            }
          />
          {list.tokens.length === 0 ? (
            <Small>
              No list for {chain.name} on this Supernote yet. Tap "Refresh
              lists" to download it, or type a contract address.
            </Small>
          ) : typed.trim() === '' ? (
            <Small>
              {list.tokens.length} tokens in the {chain.name} list of{' '}
              {fmtWhen(list.at)}.
            </Small>
          ) : null}
          {found.length > 0 && <TableHead columns={FOUND} />}
          {found.map(token => (
            <TableRow
              key={token[0]}
              columns={FOUND}
              onPress={
                mine.has(token[0]) ? undefined : () => props.onAdd(token)
              }
              cells={[
                token[1],
                mine.has(token[0]) ? 'already read' : token[2],
                shortAddress(token[0]),
              ]}
            />
          ))}
          {typed.trim() !== '' && found.length === 0 && isAddress && (
            <Btn
              label="Add this contract"
              primary
              disabled={mine.has(asAddress)}
              onPress={() => props.onAddContract(asAddress)}
            />
          )}
          {typed.trim() !== '' && found.length === 0 && !isAddress && (
            <Small>No token of the list matches "{typed.trim()}".</Small>
          )}
        </>
      )}
    </>
  );
}
