import React, {useMemo, useState} from 'react';
import {fmtWhen} from '../core/format';
import {Coin, CoinList} from '../core/model';
import {searchCoins} from '../core/search';
import {
  Btn,
  Column,
  Field,
  P,
  Small,
  TableHead,
  TableRow,
  usePageEnd,
} from '../ui/kit';

/** Coins added to the list each time its end is reached. */
const STEP = 20;
const STAR = 0;
const CONVERT = 1;
const COLUMNS: Column[] = [
  {label: 'Fav.', flex: 0.5, icon: true},
  {label: 'Conv.', flex: 0.6, icon: true},
  {label: 'Symbol', flex: 1, bold: true},
  {label: 'Name', flex: 2.2},
  {label: 'Rank', flex: 0.7, right: true},
];

interface Props {
  list: CoinList;
  /** Progress of a download of the list, '' when none is running. */
  loading: string;
  favorites: string[];
  onFavorite: (id: string) => void;
  /** Coins of the converter, in Tools. */
  converter: string[];
  onConverter: (id: string) => void;
  onPick: (coin: Coin) => void;
}

/**
 * Only coins of the stored list can be picked, so no name can be mistyped.
 * With nothing typed the list itself is shown, largest coin first. Either
 * way more lines come when the page is scrolled to its end.
 */
export function Search(props: Props) {
  const {list, loading, favorites, onFavorite, converter, onConverter} = props;
  const [typed, setTyped] = useState('');
  const [limit, setLimit] = useState(STEP);
  const empty = typed.trim() === '';
  const matching = useMemo(
    () => (empty ? list.coins : searchCoins(list.coins, typed)),
    [list, typed, empty],
  );
  usePageEnd(() => {
    if (matching.length > limit) {
      setLimit(limit + STEP);
    }
  });
  if (list.coins.length === 0) {
    return (
      <P>
        {loading !== ''
          ? loading
          : 'The list of coins is not on this Supernote yet. Tap "Download list".'}
      </P>
    );
  }
  return (
    <>
      <Field
        value={typed}
        onChangeText={text => {
          setTyped(text);
          setLimit(STEP);
        }}
        placeholder="Symbol or name, for example eth"
      />
      {empty ? (
        <Small>
          {list.coins.length} coins, largest first. List of {fmtWhen(list.at)}.
        </Small>
      ) : (
        matching.length === 0 && (
          <P>No coin of the list matches "{typed.trim()}".</P>
        )
      )}
      {matching.length > 0 && (
        <>
          <TableHead columns={COLUMNS} />
          {matching.slice(0, limit).map(coin => {
            const favorite = favorites.includes(coin.id);
            return (
              <TableRow
                key={coin.id}
                columns={COLUMNS}
                onPress={() => props.onPick(coin)}
                cells={[
                  favorite ? '★' : '☆',
                  converter.includes(coin.id) ? '☑' : '☐',
                  coin.symbol,
                  coin.name,
                  `#${coin.rank}`,
                ]}
                buttons={{
                  [STAR]: () => onFavorite(coin.id),
                  [CONVERT]: () => onConverter(coin.id),
                }}
              />
            );
          })}
          {matching.length > limit && (
            // Scrolling to the end shows more too, when the page can scroll.
            <Btn
              label={`More (${matching.length - limit} left)`}
              onPress={() => setLimit(limit + STEP)}
            />
          )}
          <Small>
            Tap a star to follow a coin in Market, a box to add it to the
            converter of Tools, a line to open it.
          </Small>
        </>
      )}
    </>
  );
}
