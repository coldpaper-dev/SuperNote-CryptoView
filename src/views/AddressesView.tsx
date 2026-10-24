import React, {useState} from 'react';
import {FAMILY_NAMES, Family} from '../core/chains';
import {
  familiesOf,
  fitsFamily,
  looksSecret,
  Wallet,
  walletKey,
} from '../core/wallets';
import {Banner, Btn, Field, Flex, Label, Row, Small} from '../ui/kit';

/** What would break a line of the addresses file. */
const BAD_NAME = /[,;\t#]/;

export const WALLETS_FILE =
  '/storage/emulated/0/MyStyle/Plugins/CryptoView/wallets.txt';
/** The same as the user finds it from the tablet's file manager. */
export const WALLETS_FILE_SHOWN = WALLETS_FILE.replace(
  '/storage/emulated/0/',
  '',
);

/** What "Create the file" writes: the format, ready to fill in. */
export const WALLETS_TEMPLATE = `# CryptoView - public addresses to read.
# One address per line:   chain, address, name
# The chain can be left out when the address says it (0x..., bc1..., inj1...).
# Chains: evm, btc, sol, near, inj, fet, atom, osmo
# For NEAR, a fourth part lists staking pools, separated by spaces.
# Lines starting with # are ignored.
#
# PUBLIC ADDRESSES ONLY. Never write a seed phrase or a private key here.
#
# Examples (remove the # and put your own):
# evm, 0x0000000000000000000000000000000000000000, Main wallet
# btc, bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Cold storage
# sol, xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Solana
# near, myname.near, Near, mypool.poolv1.near
# inj, inj1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Injective
# fet, fetch1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Fetch
# atom, cosmos1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Cosmos
# osmo, osmo1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, Osmosis
`;

/** One address typed on the tablet's keyboard. */
export function AddWallet(props: {
  existing: Wallet[];
  /** The wallet the address joins; the name can still be changed. */
  name?: string;
  onSave: (wallet: Wallet) => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState(props.name ?? '');
  const [pools, setPools] = useState('');
  const [chosen, setChosen] = useState<Family | null>(null);
  const typed = address.trim();
  const badName = BAD_NAME.test(name);
  const secret = looksSecret(typed);
  const shaped = secret ? [] : familiesOf(typed);
  // A NEAR account under another name than .near has no shape of its own:
  // offered when nothing else fits and the name has a dot.
  const possible: Family[] =
    shaped.length === 0 &&
    !secret &&
    typed.includes('.') &&
    fitsFamily(typed, 'near')
      ? ['near']
      : shaped;
  const family =
    possible.length === 1
      ? possible[0]
      : chosen && possible.includes(chosen)
      ? chosen
      : null;
  const duplicate =
    family !== null &&
    props.existing.some(
      w => walletKey(w) === walletKey({family, address: typed}),
    );
  return (
    <>
      <Label>Public address</Label>
      <Field
        value={address}
        onChangeText={setAddress}
        placeholder="0x..., bc1..., name.near, inj1..."
        autoFocus
      />
      {secret ? (
        <Banner>
          This looks like a private key or a seed phrase. Do not type it here.
          Nothing was saved.
        </Banner>
      ) : typed === '' ? (
        <Small>The chain is recognised from the address.</Small>
      ) : possible.length === 0 ? (
        <Small>Not an address CryptoView knows.</Small>
      ) : possible.length > 1 ? (
        <>
          <Small>This address fits two chains. Which one is it?</Small>
          <Row>
            {possible.map(option => (
              <Flex key={option}>
                <Btn
                  label={FAMILY_NAMES[option]}
                  selected={chosen === option}
                  onPress={() => setChosen(option)}
                />
              </Flex>
            ))}
          </Row>
        </>
      ) : (
        <Small>
          {FAMILY_NAMES[possible[0]]} address
          {possible[0] === 'evm' ? ', read on every EVM chain' : ''}.
        </Small>
      )}
      <Label>Wallet name (optional)</Label>
      <Field
        value={name}
        onChangeText={setName}
        placeholder="Ledger, savings..."
      />
      {family === 'near' && (
        <>
          <Label>Staking pools (optional)</Label>
          <Field
            value={pools}
            onChangeText={setPools}
            placeholder="pool.poolv1.near, separated by spaces"
          />
        </>
      )}
      {duplicate && <Small>This address is already in the list.</Small>}
      {badName && (
        <Small>A name cannot contain a comma, a semicolon or #.</Small>
      )}
      <Row>
        <Flex>
          <Btn label="Cancel" onPress={props.onCancel} />
        </Flex>
        <Flex>
          <Btn
            label="Save address"
            primary
            disabled={family === null || duplicate || badName}
            onPress={() =>
              family &&
              props.onSave({
                family,
                address: typed,
                name: name.trim(),
                ...(family === 'near' && pools.trim() !== ''
                  ? {
                      pools: pools
                        .trim()
                        .split(/[\s,;]+/)
                        .filter(Boolean),
                    }
                  : {}),
              })
            }
          />
        </Flex>
      </Row>
    </>
  );
}
