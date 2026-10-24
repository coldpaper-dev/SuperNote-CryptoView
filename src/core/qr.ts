/** A QR code as rows of dark and light squares, made on the tablet. */
import qrcode from 'qrcode-generator';

export function qrMatrix(text: string): boolean[][] {
  // Type 0 lets the size follow the text; M survives a smudged screen.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({length: size}, (_, row) =>
    Array.from({length: size}, (__, column) => qr.isDark(row, column)),
  );
}

/** The dark squares of one row as runs: [start, length], to draw fewer views. */
export function darkRuns(row: boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  row.forEach((dark, i) => {
    if (dark && start < 0) {
      start = i;
    }
    if (start >= 0 && (!dark || i === row.length - 1)) {
      runs.push([start, (dark ? i + 1 : i) - start]);
      start = -1;
    }
  });
  return runs;
}
