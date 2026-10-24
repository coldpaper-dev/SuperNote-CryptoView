import React, {useMemo, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {FAMILY_NAMES, Family} from '../core/chains';
import {decimalText, fmtNumber, fmtWhen} from '../core/format';
import {
  CASH,
  chainOf,
  isCash,
  ManualAccount,
  OFF_CHAIN,
  TYPED_CHAINS,
  walletNameProblem,
} from '../core/manual';
import {Coin, CoinList} from '../core/model';
import {searchCoins} from '../core/search';
import {shortAddress, Wallet, walletKey, walletName} from '../core/wallets';
import {
  Box,
  Btn,
  Column,
  Field,
  Flex,
  font,
  INK,
  Label,
  MiniBtn,
  P,
  Row,
  Rule,
  s,
  Small,
  TableHead,
  TableRow,
} from '../ui/kit';

const ADDRESSES: Column[] = [
  {label: 'Chain', flex: 1},
  {label: 'Address', flex: 1.8, bold: true},
  {label: '', flex: 1.1},
  {label: '', flex: 1},
  {label: '', flex: 1},
];
const BALANCES: Column[] = [
  {label: 'Coin', flex: 1, bold: true},
  {label: 'Chain', flex: 1.4},
  {label: 'Quantity', flex: 1.6, right: true},
];
const FOUND: Column[] = [
  {label: 'Symbol', flex: 1, bold: true},
  {label: 'Name', flex: 2.4},
  {label: 'Rank', flex: 0.7, right: true},
];
/** Coins offered at once while a name is typed. */
const OFFERED = 8;
/** The families whose tokens are listed in Chains & tokens. */
const WITH_TOKENS: Family[] = ['evm', 'solana'];

// Made at each drawing: the scale and the fonts are known only then.
const styles = () => ({
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    minHeight: s(48),
    borderTopWidth: s(2),
    borderTopColor: INK,
  } as const,
  name: {fontSize: s(16), color: INK, ...font.monoBold},
  inside: {paddingLeft: s(22), gap: s(8)},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: s(6)} as const,
  flex: {flex: 1},
});

/** A quantity typed, or null while the field is empty or unfinished. */
const typedQuantity = (text: string): number | null =>
  /\d/.test(text) && isFinite(Number(text)) && Number(text) >= 0
    ? Number(text)
    : null;

/** The quantity of a typed balance, new or changed. */
export function QuantityEditor(props: {
  account: string;
  chain: string;
  symbol: string;
  /** Absent for a balance not typed yet. */
  quantity?: number;
  /** Said above the field: why the balance may be counted twice. */
  warning?: string;
  onSave: (quantity: number) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    props.quantity === undefined ? '' : String(props.quantity),
  );
  const quantity = typedQuantity(text);
  return (
    <Box>
      <Label>
        {props.symbol} on {props.chain}, in {props.account}
      </Label>
      {props.warning && <Small>{props.warning}</Small>}
      <Field
        value={text}
        onChangeText={typed => setText(decimalText(typed))}
        placeholder="0.00"
        autoFocus
      />
      <Row>
        <Flex>
          <Btn label="Cancel" onPress={props.onCancel} />
        </Flex>
        {props.onRemove && (
          <Flex>
            <Btn label="Remove" onPress={props.onRemove} />
          </Flex>
        )}
        <Flex>
          <Btn
            label="Save"
            primary
            disabled={quantity === null}
            onPress={() => quantity !== null && props.onSave(quantity)}
          />
        </Flex>
      </Row>
    </Box>
  );
}

/** A coin of the list, or cash, picked by its symbol or name. */
function CoinPicker(props: {
  list: CoinList;
  onPick: (coin: Coin) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const found = useMemo(
    () =>
      typed.trim() === ''
        ? CASH
        : searchCoins([...CASH, ...props.list.coins], typed).slice(0, OFFERED),
    [props.list, typed],
  );
  return (
    <Box>
      <Label>Add a balance: which coin?</Label>
      <Field
        value={typed}
        onChangeText={setTyped}
        placeholder="Symbol or name, for example btc"
        autoFocus
      />
      {props.list.coins.length === 0 && (
        <Small>
          Only euros and dollars until the list of coins is downloaded
          (Settings, Import/Export).
        </Small>
      )}
      {found.length === 0 ? (
        <P>No coin of the list matches "{typed.trim()}".</P>
      ) : (
        <>
          <TableHead columns={FOUND} />
          {found.map(coin => (
            <TableRow
              key={coin.id}
              columns={FOUND}
              onPress={() => props.onPick(coin)}
              cells={[
                coin.symbol.toUpperCase(),
                coin.name,
                coin.rank > 0 ? `#${coin.rank}` : 'cash',
              ]}
            />
          ))}
        </>
      )}
      <Btn label="Cancel" onPress={props.onCancel} />
    </Box>
  );
}

/** The chain a typed balance sits on. */
function ChainPicker(props: {
  symbol: string;
  onPick: (chain: string) => void;
  onCancel: () => void;
}) {
  const n = styles();
  return (
    <Box>
      <Label>{props.symbol}: on which chain?</Label>
      <View style={n.wrap}>
        {TYPED_CHAINS.map(chain => (
          <MiniBtn
            key={chain}
            label={chain}
            selected={chain === OFF_CHAIN}
            onPress={() => props.onPick(chain)}
          />
        ))}
      </View>
      <Small>
        Off-chain for an exchange or a bank. A chain for a position the plugin
        does not read there, in a protocol for instance.
      </Small>
      <Btn label="Cancel" onPress={props.onCancel} />
    </Box>
  );
}

/** A name for a wallet, new or renamed. */
function NameEditor(props: {
  title: string;
  name: string;
  taken: string[];
  onSave: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(props.name);
  const problem = walletNameProblem(name, props.taken);
  return (
    <>
      <Label>{props.title}</Label>
      <Field
        value={name}
        onChangeText={setName}
        placeholder="Ledger, Kraken, Bank..."
      />
      {name.trim() !== '' && problem !== '' && <Small>{problem}</Small>}
      <Row>
        {props.onCancel && (
          <Flex>
            <Btn label="Cancel" onPress={props.onCancel} />
          </Flex>
        )}
        <Flex>
          <Btn
            label="Save"
            primary
            disabled={problem !== ''}
            onPress={() => {
              props.onSave(name.trim());
              setName('');
            }}
          />
        </Flex>
      </Row>
    </>
  );
}

type Editing =
  | {
      kind: 'balance';
      wallet: string;
      coin: Coin;
      chain: string;
      quantity?: number;
    }
  | {kind: 'coin'; wallet: string}
  | {kind: 'chain'; wallet: string; coin: Coin}
  | {kind: 'rename'; wallet: string}
  | {kind: 'delete'; wallet: string}
  | {kind: 'address'; wallet: string; key: string}
  | {kind: 'move'; wallet: string; key: string}
  | null;

/**
 * Every wallet: a name, with the addresses read and the balances typed.
 * A wallet unfolds to show and change them.
 */
export function WalletsSettings(props: {
  wallets: Wallet[];
  accounts: ManualAccount[];
  list: CoinList;
  onAddAddress: (wallet: string) => void;
  onRemoveAddress: (key: string) => void;
  /** Puts an address in another wallet, existing or new. */
  onMoveAddress: (key: string, to: string) => void;
  /** Opens the tokens read on the chains of an address. */
  onTokens: (family: Family) => void;
  onAddWallet: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSetBalance: (
    wallet: string,
    coin: Coin,
    chain: string,
    quantity: number | null,
  ) => void;
  /** Whether an address of the wallet already reads that coin there. */
  alreadyRead: (wallet: string, coin: string, chain: string) => boolean;
  /** What "Find my tokens" did, line by line. */
  report: string[];
}) {
  const n = styles();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const done = () => setEditing(null);
  const names = [
    ...new Set([
      ...props.wallets.map(walletName),
      ...props.accounts.map(account => account.name),
    ]),
  ];
  const toggle = (name: string) => {
    const next = new Set(open);
    if (!next.delete(name)) {
      next.add(name);
    }
    setOpen(next);
  };
  const warning = (wallet: string, coin: Coin, chain: string) =>
    !isCash(coin.id) && props.alreadyRead(wallet, coin.id, chain)
      ? `An address of ${wallet} already holds ${coin.symbol.toUpperCase()} on ` +
        `${chain}, read by the plugin: typing it too counts it twice.`
      : undefined;

  const balanceEditor = (wallet: string, edit: Editing) =>
    edit?.kind === 'balance' && (
      <QuantityEditor
        account={wallet}
        chain={edit.chain}
        symbol={edit.coin.symbol.toUpperCase()}
        quantity={edit.quantity}
        warning={warning(wallet, edit.coin, edit.chain)}
        onSave={quantity => {
          props.onSetBalance(wallet, edit.coin, edit.chain, quantity);
          done();
        }}
        onRemove={
          edit.quantity === undefined
            ? undefined
            : () => {
                props.onSetBalance(wallet, edit.coin, edit.chain, null);
                done();
              }
        }
        onCancel={done}
      />
    );

  return (
    <>
      <P>
        A wallet is a name. It holds the addresses the plugin reads, and the
        balances you type: an exchange account, a position the plugin does not
        read, cash.
      </P>
      {names.length === 0 && <Small>No wallet yet.</Small>}
      {names.map(name => {
        const addresses = props.wallets.filter(w => walletName(w) === name);
        const account = props.accounts.find(a => a.name === name);
        const balances = account?.holdings ?? [];
        const unfolded = open.has(name);
        const now = editing?.wallet === name ? editing : null;
        const newBalance =
          now?.kind === 'balance' &&
          !balances.some(
            h => h.coin === now.coin.id && chainOf(h) === now.chain,
          );
        return (
          <React.Fragment key={name}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{expanded: unfolded}}
              style={n.wallet}
              onPress={() => toggle(name)}>
              <Text style={[n.name, n.flex]}>
                {unfolded ? '▼ ' : '▶ '}
                {name}
              </Text>
              <Small>
                {addresses.length} address{addresses.length === 1 ? '' : 'es'} ·{' '}
                {balances.length} typed
              </Small>
            </Pressable>
            {unfolded && (
              <View style={n.inside}>
                <Row>
                  <Flex>
                    <MiniBtn
                      label="Rename"
                      onPress={() => setEditing({kind: 'rename', wallet: name})}
                    />
                  </Flex>
                  <Flex>
                    <MiniBtn
                      label="Delete"
                      onPress={() => setEditing({kind: 'delete', wallet: name})}
                    />
                  </Flex>
                </Row>
                {now?.kind === 'rename' && (
                  <NameEditor
                    title="New name"
                    name={name}
                    taken={names.filter(other => other !== name)}
                    onSave={to => {
                      props.onRename(name, to);
                      setOpen(
                        new Set([...open].map(o => (o === name ? to : o))),
                      );
                      done();
                    }}
                    onCancel={done}
                  />
                )}
                {now?.kind === 'delete' && (
                  <Box>
                    <P>
                      Delete {name}: its {addresses.length} addresses and{' '}
                      {balances.length} typed balances?
                    </P>
                    <Row>
                      <Flex>
                        <Btn label="Keep it" onPress={done} />
                      </Flex>
                      <Flex>
                        <Btn
                          label="Delete"
                          primary
                          onPress={() => {
                            props.onDelete(name);
                            done();
                          }}
                        />
                      </Flex>
                    </Row>
                  </Box>
                )}
                <Label>Addresses, read on their chains</Label>
                {addresses.length === 0 ? (
                  <Small>None.</Small>
                ) : (
                  <>
                    <TableHead columns={ADDRESSES} />
                    {addresses.map(wallet => {
                      const key = walletKey(wallet);
                      const tokens = WITH_TOKENS.includes(wallet.family);
                      return (
                        <React.Fragment key={key}>
                          <TableRow
                            columns={ADDRESSES}
                            cells={[
                              FAMILY_NAMES[wallet.family],
                              shortAddress(wallet.address),
                              tokens ? 'Tokens ›' : '',
                              'Move',
                              'Remove',
                            ]}
                            buttons={{
                              2: tokens
                                ? () => props.onTokens(wallet.family)
                                : undefined,
                              3: () =>
                                setEditing({kind: 'move', wallet: name, key}),
                              4: () =>
                                setEditing({
                                  kind: 'address',
                                  wallet: name,
                                  key,
                                }),
                            }}
                          />
                          {now?.kind === 'move' && now.key === key && (
                            <Box>
                              <Label>
                                Move {shortAddress(wallet.address)} to
                              </Label>
                              <View style={n.wrap}>
                                {names
                                  .filter(other => other !== name)
                                  .map(other => (
                                    <MiniBtn
                                      key={other}
                                      label={other}
                                      onPress={() => {
                                        props.onMoveAddress(key, other);
                                        done();
                                      }}
                                    />
                                  ))}
                              </View>
                              <NameEditor
                                title="or a new wallet"
                                name=""
                                taken={names}
                                onSave={to => {
                                  props.onMoveAddress(key, to);
                                  done();
                                }}
                                onCancel={done}
                              />
                            </Box>
                          )}
                          {now?.kind === 'address' && now.key === key && (
                            <Box>
                              <P>
                                Stop reading {shortAddress(wallet.address)}? It
                                leaves the addresses file too.
                              </P>
                              <Row>
                                <Flex>
                                  <Btn label="Keep it" onPress={done} />
                                </Flex>
                                <Flex>
                                  <Btn
                                    label="Remove"
                                    primary
                                    onPress={() => {
                                      props.onRemoveAddress(key);
                                      done();
                                    }}
                                  />
                                </Flex>
                              </Row>
                            </Box>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
                <Label>
                  Typed balances
                  {account && account.at > 0
                    ? `, changed ${fmtWhen(account.at)}`
                    : ''}
                </Label>
                {balances.length === 0 ? (
                  <Small>None.</Small>
                ) : (
                  <>
                    <TableHead columns={BALANCES} />
                    {balances.map(holding => {
                      const chain = chainOf(holding);
                      const coin: Coin = {
                        id: holding.coin,
                        symbol: holding.symbol,
                        name: holding.name,
                        rank: 0,
                      };
                      const edited =
                        now?.kind === 'balance' &&
                        now.coin.id === holding.coin &&
                        now.chain === chain;
                      return (
                        <React.Fragment key={`${holding.coin}|${chain}`}>
                          <TableRow
                            columns={BALANCES}
                            cells={[
                              holding.symbol,
                              chain,
                              fmtNumber(holding.quantity),
                            ]}
                            buttons={{
                              2: () =>
                                setEditing(
                                  edited
                                    ? null
                                    : {
                                        kind: 'balance',
                                        wallet: name,
                                        coin,
                                        chain,
                                        quantity: holding.quantity,
                                      },
                                ),
                            }}
                          />
                          {edited && balanceEditor(name, now)}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
                {now?.kind === 'coin' && (
                  <CoinPicker
                    list={props.list}
                    onPick={coin =>
                      setEditing(
                        isCash(coin.id)
                          ? {
                              kind: 'balance',
                              wallet: name,
                              coin,
                              chain: OFF_CHAIN,
                            }
                          : {kind: 'chain', wallet: name, coin},
                      )
                    }
                    onCancel={done}
                  />
                )}
                {now?.kind === 'chain' && (
                  <ChainPicker
                    symbol={now.coin.symbol.toUpperCase()}
                    onPick={chain => {
                      const held = balances.find(
                        h => h.coin === now.coin.id && chainOf(h) === chain,
                      );
                      setEditing({
                        kind: 'balance',
                        wallet: name,
                        coin: now.coin,
                        chain,
                        quantity: held?.quantity,
                      });
                    }}
                    onCancel={done}
                  />
                )}
                {newBalance && balanceEditor(name, now)}
                <Row>
                  <Flex>
                    <Btn
                      label="Add an address"
                      onPress={() => props.onAddAddress(name)}
                    />
                  </Flex>
                  <Flex>
                    <Btn
                      label="Add a balance"
                      onPress={() => setEditing({kind: 'coin', wallet: name})}
                    />
                  </Flex>
                </Row>
              </View>
            )}
          </React.Fragment>
        );
      })}
      <Rule />
      <NameEditor
        title="New wallet"
        name=""
        taken={names}
        onSave={props.onAddWallet}
      />
      <Rule />
      {props.report.map(line => (
        <Small key={line}>{line}</Small>
      ))}
      <Small>
        "Find my tokens" searches every chain for the tokens your addresses hold
        and adds them to Chains & tokens. Run it once, and again after you
        receive a new token.
      </Small>
      <Small>
        Public addresses only. Never type a seed phrase or a private key:
        CryptoView has no use for them.
      </Small>
    </>
  );
}
