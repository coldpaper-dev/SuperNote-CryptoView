/**
 * Where to ask for help, and where a thank-you can be sent. These addresses
 * are only shown: the plugin never reads them.
 */
export const HELP_URL =
  'https://github.com/coldpaper-dev/Supernote-CryptoView/issues';

export interface Tip {
  label: string;
  /** The networks the address is watched on. */
  chains: string;
  address: string;
}

export const TIPS: Tip[] = [
  {
    label: 'Ethereum',
    chains: 'Ethereum mainnet, Arbitrum or HyperEVM',
    address: '0x9a39eD99E82825b75aC636DcF6D851C9ee0CDC97',
  },
  {
    label: 'Solana',
    chains: 'Solana',
    address: '4oZejAJqp71aehyjQwZ4PKgWmaLneA53TBAAmKz9ARXS',
  },
];
