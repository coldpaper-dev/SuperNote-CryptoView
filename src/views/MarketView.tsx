import React, {useContext, useState} from 'react';
import {
  KeySort,
  marketCols,
  MarketRow,
  shown,
  sortItems,
  sortShown,
  turned,
} from '../core/columns';
import {Currency, Quote} from '../core/model';
import {Line} from '../core/portfolio';
import {DataTable, P, PickedColumns, Small} from '../ui/kit';

interface Props {
  favorites: string[];
  quotes: Record<string, Quote>;
  currency: Currency;
  /** The portfolio lines, by coin id. */
  held: Record<string, Line>;
  onOpen: (id: string) => void;
}

/** The favorites, in the order they were added until a title is tapped. */
export function MarketView({favorites, quotes, currency, held, onOpen}: Props) {
  const {picked} = useContext(PickedColumns);
  const [sort, setSort] = useState<KeySort | null>(null);
  if (favorites.length === 0) {
    return <P>No favorite yet. Use "Find a coin" to add one.</P>;
  }
  const all = marketCols({currency, held});
  const cols = shown(all, picked.market);
  const rows: MarketRow[] = favorites.map(id => ({id, quote: quotes[id]}));
  return (
    <>
      <DataTable
        choices={{table: 'market', all: all}}
        columns={cols}
        sort={sortShown(cols, sort)}
        onSort={index => setSort(turned(all, sort, cols[index].key))}
        rows={sortItems(all, sort, rows).map(row => ({
          key: row.id,
          cells: cols.map(col => col.text(row)),
          onPress: () => onOpen(row.id),
          plain: !held[row.id],
        }))}
      />
      <Small>
        In bold, the coins you hold. Tap a line for every change of that coin.
      </Small>
    </>
  );
}
