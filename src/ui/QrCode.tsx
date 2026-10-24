import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {darkRuns, qrMatrix} from '../core/qr';
import {INK, PAPER, s} from './kit';

/** Side of the QR code, in design units. */
const QR_SIDE = 300;
/** Light margin around it, in squares: a reader needs it. */
const QUIET = 4;

const q = StyleSheet.create({
  frame: {alignSelf: 'center', backgroundColor: PAPER},
  dark: {position: 'absolute', backgroundColor: INK},
});

/** A QR code drawn as plain rectangles, about `size` units wide. */
export function QrCode({text, size = QR_SIDE}: {text: string; size?: number}) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  // A whole number of pixels per square, or the code blurs.
  const cell = Math.max(1, Math.floor(s(size) / (matrix.length + 2 * QUIET)));
  const side = cell * (matrix.length + 2 * QUIET);
  return (
    <View style={[q.frame, {width: side, height: side}]}>
      {matrix.map((row, y) =>
        darkRuns(row).map(([start, length]) => (
          <View
            key={`${y}.${start}`}
            style={[
              q.dark,
              {
                left: (start + QUIET) * cell,
                top: (y + QUIET) * cell,
                width: length * cell,
                height: cell,
              },
            ]}
          />
        )),
      )}
    </View>
  );
}
