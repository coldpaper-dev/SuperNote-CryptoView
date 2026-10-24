/** Sorting the rows of a table by one of its columns. */

/** Sorted by one figure or name; an item without it goes last. */
export function sortBy<T>(
  items: T[],
  key: (item: T) => number | string | null,
  descending: boolean,
): T[] {
  return [...items].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null || y === null) {
      return x === y ? 0 : x === null ? 1 : -1;
    }
    const order = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
    return descending ? -order : order;
  });
}
