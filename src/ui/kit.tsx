/**
 * Shared building blocks of every view. Sizes are written for a
 * 768-unit-wide screen (the design mockup) and scaled to the device.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import {version as APP_VERSION} from '../../package.json';
import {ViewNative} from '../native';

let unit = 1;
let version = 0;

// A Manta is 1024 dp wide. On a smaller screen (a Nomad is about 750 dp) the
// same 768 units would make the text too small to read, so fewer units are
// laid across the width and the content scrolls.
const SMALL_SCREEN_DP = 900;

export function setUnit(screenWidth: number): void {
  const next = screenWidth / (screenWidth < SMALL_SCREEN_DP ? 672 : 768);
  if (next !== unit) {
    unit = next;
    version++;
  }
}

export const s = (n: number): number => Math.round(n * unit);

/** Styles depend on the unit and the fonts, known only once the view is up. */
function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  build: () => T,
): () => T {
  let cache: {version: number; styles: T} | null = null;
  return () => {
    if (!cache || cache.version !== version) {
      cache = {version, styles: StyleSheet.create(build())};
    }
    return cache.styles;
  };
}

const CHART_HEIGHT = 130;

export const INK = '#000';
const GREY = '#555';
export const PAPER = '#fff';
/** Background of a side-menu entry; light enough for black text. */
const TINT = '#e2e2e2';

// Until the plugin's own font files are registered, fall back to the system
// monospace face and get the bold from fontWeight.
const SYSTEM: Record<'mono' | 'monoBold' | 'pixel' | 'pixelBold', TextStyle> = {
  mono: {fontFamily: 'monospace'},
  monoBold: {fontFamily: 'monospace', fontWeight: '700'},
  pixel: {fontFamily: 'monospace'},
  pixelBold: {fontFamily: 'monospace', fontWeight: '700'},
};
export const font = {...SYSTEM};

const FONT_FILES = {
  mono: ['PlexMono', require('../../assets/fonts/IBMPlexMono-Regular.ttf')],
  monoBold: [
    'PlexMonoBold',
    require('../../assets/fonts/IBMPlexMono-SemiBold.ttf'),
  ],
  pixel: ['Silkscreen', require('../../assets/fonts/Silkscreen-Regular.ttf')],
  pixelBold: [
    'SilkscreenBold',
    require('../../assets/fonts/Silkscreen-Bold.ttf'),
  ],
} as const;

/** Returns '' on success, or why the system font is still in use. */
export async function loadFonts(): Promise<string> {
  if (!ViewNative) {
    return 'native module missing';
  }
  try {
    for (const key of Object.keys(FONT_FILES) as (keyof typeof FONT_FILES)[]) {
      const [family, file] = FONT_FILES[key];
      await ViewNative.loadFont(family, Image.resolveAssetSource(file).uri);
      font[key] = {fontFamily: family};
    }
    version++;
    return '';
  } catch (e) {
    Object.assign(font, SYSTEM);
    version++;
    return (e as Error).message;
  }
}

const useKit = makeStyles(() => ({
  screen: {flex: 1, backgroundColor: PAPER},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    height: s(52),
    paddingLeft: s(24),
    paddingRight: s(24),
    borderBottomWidth: s(2),
    borderBottomColor: INK,
  },
  brand: {fontSize: s(16), color: INK, ...font.pixelBold},
  status: {flex: 1, fontSize: s(10), color: INK, ...font.pixel},
  refresh: {
    height: s(36),
    minWidth: s(104),
    borderWidth: s(2),
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(10),
  },
  refreshBusy: {borderStyle: 'dashed', borderColor: GREY},
  exit: {minWidth: s(64)},
  sorted: {color: INK},
  sortable: {justifyContent: 'center', minHeight: s(34)},
  refreshText: {fontSize: s(12), color: INK, ...font.pixelBold},
  refreshTextBusy: {color: GREY},
  columns: {flex: 1, flexDirection: 'row'},
  nav: {
    width: s(180),
    borderRightWidth: s(2),
    borderRightColor: INK,
    padding: s(8),
    gap: s(6),
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    minHeight: s(48),
    paddingHorizontal: s(8),
    backgroundColor: TINT,
  },
  navMark: {
    width: s(14),
    height: s(14),
    borderWidth: s(3),
    borderColor: INK,
    backgroundColor: PAPER,
  },
  navMarkNow: {backgroundColor: INK},
  navLabel: {
    flex: 1,
    fontSize: s(11),
    color: INK,
    textTransform: 'uppercase',
    ...font.pixel,
  },
  navLabelNow: {fontSize: s(13), ...font.pixelBold},
  navPage: {
    minHeight: s(40),
    marginLeft: s(24),
    paddingHorizontal: s(8),
    justifyContent: 'center',
    borderLeftWidth: s(3),
    borderLeftColor: INK,
  },
  navPageNow: {backgroundColor: INK},
  navPageLabel: {
    fontSize: s(10),
    color: INK,
    textTransform: 'uppercase',
    ...font.pixel,
  },
  navPageLabelNow: {color: PAPER, ...font.pixelBold},
  main: {flex: 1},
  scroll: {flex: 1},
  content: {
    flexGrow: 1,
    paddingTop: s(18),
    paddingBottom: s(14),
    paddingHorizontal: s(24),
    gap: s(12),
  },
  footer: {
    borderTopWidth: s(2),
    borderTopColor: INK,
    paddingVertical: s(12),
    paddingHorizontal: s(24),
    gap: s(10),
  },
  field: {
    height: s(52),
    borderWidth: s(2),
    borderColor: INK,
    paddingHorizontal: s(12),
    paddingVertical: 0,
    fontSize: s(16),
    color: INK,
    ...font.mono,
  },
  chart: {
    flexDirection: 'row',
    height: s(CHART_HEIGHT),
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  chartColumn: {flex: 1},
  between: {flexDirection: 'row', justifyContent: 'space-between'},
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    minHeight: s(44),
    borderTopWidth: 1,
    borderTopColor: INK,
  },
  th: {minHeight: s(28), borderTopWidth: 0},
  dataTable: {flexDirection: 'row'},
  dataLine: {flexDirection: 'row'},
  dataHead: {height: s(HEAD), justifyContent: 'center'},
  dataRow: {
    height: s(ROW),
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: INK,
  },
  dataCell: {paddingLeft: s(GAP)},
  dataFirst: {maxWidth: '40%'},
  dataUnder: {position: 'absolute', left: 0, right: 0},
  unseen: {opacity: 0},
  grow: {flexGrow: 1},
  cellBtnStart: {alignSelf: 'flex-start'},
  cellBtnEnd: {alignSelf: 'flex-end'},
  cellIcon: {minHeight: s(44), justifyContent: 'center'},
  icon: {fontSize: s(18)},
  pickerList: {flexDirection: 'row', flexWrap: 'wrap', gap: s(6)},
  choice: {flexDirection: 'row', alignItems: 'center', gap: s(5)},
  place: {
    width: s(16),
    height: s(16),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: INK,
    backgroundColor: PAPER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: {fontSize: s(9), lineHeight: s(12), color: INK, ...font.monoBold},
  columnsBtn: {
    height: s(HEAD),
    paddingLeft: s(GAP),
    justifyContent: 'center',
  },
  columnsIcon: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: s(22),
    height: s(18),
    borderWidth: s(2),
    borderColor: INK,
  },
  columnsIconOn: {backgroundColor: TINT},
  columnsBar: {width: s(2), backgroundColor: INK},
  td: {fontSize: s(14), color: INK, ...font.mono},
  tdBold: {fontSize: s(15), color: INK, ...font.monoBold},
  right: {textAlign: 'right'},
  h1: {
    fontSize: s(24),
    lineHeight: s(28),
    color: INK,
    textTransform: 'uppercase',
    ...font.pixelBold,
  },
  h2: {fontSize: s(14), lineHeight: s(21), color: INK, ...font.monoBold},
  p: {fontSize: s(14), lineHeight: s(21), color: INK, ...font.mono},
  small: {fontSize: s(13), lineHeight: s(19), color: GREY, ...font.mono},
  label: {
    fontSize: s(11),
    color: GREY,
    textTransform: 'uppercase',
    ...font.pixel,
  },
  btn: {
    height: s(52),
    borderWidth: s(2),
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(10),
  },
  btnFilled: {backgroundColor: INK},
  mini: {
    minHeight: s(34),
    borderWidth: s(2),
    borderColor: INK,
    justifyContent: 'center',
    paddingHorizontal: s(8),
  },
  miniText: {fontSize: s(12), color: INK, ...font.monoBold},
  tiny: {minHeight: s(26), paddingHorizontal: s(6)},
  tinyText: {fontSize: s(10)},
  cellEnd: {alignItems: 'flex-end'},
  cellTagged: {flexDirection: 'row', alignItems: 'center', gap: s(8)},
  cellBtn: {
    minHeight: s(30),
    borderWidth: s(2),
    borderColor: INK,
    justifyContent: 'center',
    paddingHorizontal: s(6),
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    borderTopWidth: s(2),
    borderTopColor: INK,
    paddingTop: s(10),
  },
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: s(8)},
  btnDisabled: {
    borderStyle: 'dashed',
    borderColor: GREY,
    backgroundColor: PAPER,
  },
  btnText: {
    fontSize: s(13),
    color: INK,
    textAlign: 'center',
    textTransform: 'uppercase',
    ...font.pixelBold,
  },
  btnTextFilled: {color: PAPER},
  btnTextDisabled: {color: GREY},
  option: {
    flexDirection: 'row',
    gap: s(10),
    borderWidth: 1,
    borderColor: INK,
    paddingVertical: s(8),
    paddingHorizontal: s(12),
    minHeight: s(48),
  },
  optionSelected: {
    borderWidth: s(3),
    paddingVertical: s(6),
    paddingHorizontal: s(10),
  },
  radio: {
    width: s(16),
    height: s(16),
    borderWidth: s(2),
    borderColor: INK,
    marginTop: s(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {width: s(8), height: s(8), backgroundColor: INK},
  optionText: {flex: 1},
  row: {flexDirection: 'row', gap: s(12)},
  flex: {flex: 1},
  box: {
    borderWidth: s(2),
    borderColor: INK,
    paddingVertical: s(8),
    paddingHorizontal: s(12),
  },
  banner: {
    backgroundColor: INK,
    paddingVertical: s(6),
    paddingHorizontal: s(12),
  },
  bannerText: {fontSize: s(13), color: PAPER, ...font.monoBold},
  rule: {borderTopWidth: s(2), borderTopColor: INK},
}));

type Kids = {children: React.ReactNode};

export const H2 = ({children}: Kids) => (
  <Text style={useKit().h2}>{children}</Text>
);
export const P = ({children}: Kids) => (
  <Text style={useKit().p}>{children}</Text>
);
export const Small = ({children}: Kids) => (
  <Text style={useKit().small}>{children}</Text>
);
export const Label = ({children}: Kids) => (
  <Text style={useKit().label}>{children}</Text>
);
export const Row = ({children}: Kids) => (
  <View style={useKit().row}>{children}</View>
);
export const Flex = ({children}: Kids) => (
  <View style={useKit().flex}>{children}</View>
);
export const Box = ({children}: Kids) => (
  <View style={useKit().box}>{children}</View>
);
export const Rule = () => <View style={useKit().rule} />;
/** Two texts at the two ends of a line. */
export const Between = ({children}: Kids) => (
  <View style={useKit().between}>{children}</View>
);

export function Banner({children}: Kids) {
  const k = useKit();
  return (
    <View style={k.banner}>
      <Text style={k.bannerText}>{children}</Text>
    </View>
  );
}

interface BtnProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** Shown as chosen in a group of alternatives. */
  selected?: boolean;
}

export function Btn({label, onPress, primary, disabled, selected}: BtnProps) {
  const k = useKit();
  const filled = (primary || selected) && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      onPress={onPress}
      style={[k.btn, filled && k.btnFilled, disabled && k.btnDisabled]}>
      <Text
        style={[
          k.btnText,
          filled && k.btnTextFilled,
          disabled && k.btnTextDisabled,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A small button, for the corner of a box or the end of a title. */
export function MiniBtn({
  label,
  onPress,
  disabled,
  selected,
  tiny,
}: BtnProps & {tiny?: boolean}) {
  const k = useKit();
  const filled = selected && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      onPress={onPress}
      style={[
        k.mini,
        tiny && k.tiny,
        filled && k.btnFilled,
        disabled && k.btnDisabled,
      ]}>
      <Text
        numberOfLines={1}
        style={[
          k.miniText,
          tiny && k.tinyText,
          filled && k.btnTextFilled,
          disabled && k.btnTextDisabled,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The title of one part of a page, with what acts on that part at its end. */
export function Section(props: {
  title: string;
  /** Said after the title, in grey: where the figures come from. */
  note?: string;
  children?: React.ReactNode;
}) {
  const k = useKit();
  return (
    <View style={k.section}>
      <Text style={[k.h2, k.flex]}>
        {props.title}
        {props.note ? <Text style={k.small}> · {props.note}</Text> : null}
      </Text>
      {props.children}
    </View>
  );
}

interface OptionProps {
  title: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

export function Option({title, selected, onPress, children}: OptionProps) {
  const k = useKit();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[k.option, selected && k.optionSelected]}>
      <View style={k.radio}>{selected && <View style={k.radioDot} />}</View>
      <View style={k.optionText}>
        <Text style={k.h2}>{title}</Text>
        {children}
      </View>
    </Pressable>
  );
}

/** One line of text typed on the tablet's own keyboard. */
export function Field(props: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const k = useKit();
  return (
    <TextInput
      style={k.field}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={GREY}
      autoFocus={props.autoFocus}
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      underlineColorAndroid="transparent"
    />
  );
}

/**
 * A line of price history: one column per value, each a black mark joined
 * to the previous one. Drawn with plain views, the screen has no canvas.
 */
export function Chart({values}: {values: number[]}) {
  const k = useKit();
  if (values.length < 2) {
    return <View style={k.chart} />;
  }
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const height = s(CHART_HEIGHT);
  const thick = s(3);
  const y = (value: number) =>
    Math.round(((value - low) / span) * (height - thick));
  return (
    <View style={k.chart}>
      {values.map((value, i) => {
        const here = y(value);
        const before = y(values[i === 0 ? 0 : i - 1]);
        return (
          <View key={i} style={k.chartColumn}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: Math.min(here, before),
                height: Math.abs(here - before) + thick,
                backgroundColor: INK,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

export interface Column {
  label: string;
  /** Share of the row's width. */
  flex: number;
  right?: boolean;
  bold?: boolean;
  /** A cell that is a button shows a sign alone, larger and with no frame. */
  icon?: boolean;
}

/** Which column a table is sorted by, and which way. */
export interface Sort {
  index: number;
  descending: boolean;
}

/**
 * Column titles of a table. With `onSort` each title is a button, and the
 * sorted column carries an arrow.
 */
export function TableHead(props: {
  columns: Column[];
  sort?: Sort;
  onSort?: (index: number) => void;
}) {
  const k = useKit();
  const {columns, sort, onSort} = props;
  return (
    <View style={[k.tr, k.th]}>
      {columns.map((column, i) => {
        const arrow = sort?.index === i ? (sort.descending ? ' ▼' : ' ▲') : '';
        const title = (
          <Text
            numberOfLines={1}
            style={[
              k.label,
              !onSort && {flex: column.flex},
              column.right && k.right,
              arrow !== '' && k.sorted,
            ]}>
            {column.label}
            {arrow}
          </Text>
        );
        return onSort ? (
          <Pressable
            key={column.label}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${column.label}`}
            style={[{flex: column.flex}, k.sortable]}
            onPress={() => onSort(i)}>
            {title}
          </Pressable>
        ) : (
          <React.Fragment key={column.label}>{title}</React.Fragment>
        );
      })}
    </View>
  );
}

/** One line of a table; tall enough to be tapped when it opens something. */
export function TableRow(props: {
  columns: Column[];
  cells: string[];
  onPress?: () => void;
  /** Cells drawn as a button of their own, by column. */
  buttons?: Record<number, (() => void) | undefined>;
  /**
   * With a tag, the cell keeps its text and the button is the tag after it.
   */
  tags?: Record<number, string>;
}) {
  const k = useKit();
  const cells = props.columns.map((column, i) => {
    const press = props.buttons?.[i];
    const tag = props.tags?.[i];
    return press && tag ? (
      <View key={column.label} style={[{flex: column.flex}, k.cellTagged]}>
        <Text numberOfLines={1} style={k.td}>
          {props.cells[i]}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tag}: ${props.cells[i]}`}
          style={k.cellBtn}
          onPress={press}>
          <Text numberOfLines={1} style={k.td}>
            {tag}
          </Text>
        </Pressable>
      </View>
    ) : press ? (
      <View
        key={column.label}
        style={[{flex: column.flex}, column.right && k.cellEnd]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${column.label}: ${props.cells[i]}`}
          style={column.icon ? k.cellIcon : k.cellBtn}
          onPress={press}>
          <Text numberOfLines={1} style={[k.td, column.icon && k.icon]}>
            {props.cells[i]}
          </Text>
        </Pressable>
      </View>
    ) : (
      <Text
        key={column.label}
        numberOfLines={1}
        style={[
          column.bold ? k.tdBold : k.td,
          {flex: column.flex},
          column.right && k.right,
        ]}>
        {props.cells[i]}
      </Text>
    );
  });
  return props.onPress ? (
    <Pressable accessibilityRole="button" style={k.tr} onPress={props.onPress}>
      {cells}
    </Pressable>
  ) : (
    <View style={k.tr}>{cells}</View>
  );
}

export interface DataColumn {
  key: string;
  label: string;
  left?: boolean;
}

export interface DataRow {
  key: string;
  cells: string[];
  onPress?: () => void;
  /** Cells drawn as a button of their own, by column key. */
  buttons?: Record<string, () => void>;
  /** With a tag, the cell keeps its text and the button is the tag after it. */
  tags?: Record<string, string>;
  /** Shown under the row, across the whole width. */
  after?: React.ReactNode;
  /** The first cell in the regular weight, to set the bold ones apart. */
  plain?: boolean;
}

/** What a table can show, for the list its title line unfolds. */
export interface ColumnChoices {
  table: string;
  /** Every column of the table; the first is always there, so not offered. */
  all: {key: string; label: string; on?: boolean}[];
}

const ROW = 44;
const HEAD = 34;
const GAP = 8;

/**
 * A table whose first column stays in place while the others slide
 * sideways under the finger. It is laid out column by column, so that each
 * one is as wide as its longest text, and wider when there is room left.
 * Every row has the same height, so that the columns stay level; what
 * comes under a row is laid over a gap of its height, across the table.
 * With `onSort` each title is a button; with `choices` the title line ends
 * the first column with the button that unfolds the list of columns.
 */
export function DataTable(props: {
  columns: DataColumn[];
  rows: DataRow[];
  /** Index of the sorted column, as in `columns`. */
  sort?: Sort;
  onSort?: (index: number) => void;
  choices?: ColumnChoices;
}) {
  const k = useKit();
  const {columns, rows, sort, onSort, choices} = props;
  const [picking, setPicking] = useState(false);
  /** Height of what is under a row, by row, once it has been drawn. */
  const [under, setUnder] = useState<Record<string, number>>({});
  const [first, ...rest] = columns;

  const title = (column: DataColumn, index: number) => {
    const arrow = sort?.index === index ? (sort.descending ? ' ▼' : ' ▲') : '';
    const text = (
      <Text
        numberOfLines={1}
        style={[
          k.label,
          index > 0 && !column.left && k.right,
          arrow !== '' && k.sorted,
        ]}>
        {column.label}
        {arrow}
      </Text>
    );
    const box = [k.dataHead, index > 0 ? k.dataCell : k.grow];
    return onSort ? (
      <Pressable
        key={column.key}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${column.label}`}
        style={box}
        onPress={() => onSort(index)}>
        {text}
      </Pressable>
    ) : (
      <View key={column.key} style={box}>
        {text}
      </View>
    );
  };

  const inside = (row: DataRow, column: DataColumn, text: string) => {
    const press = row.buttons?.[column.key];
    const tag = row.tags?.[column.key];
    if (press && tag) {
      return (
        <View style={k.cellTagged}>
          <Text numberOfLines={1} style={k.td}>
            {text}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${tag}: ${text}`}
            style={k.cellBtn}
            onPress={press}>
            <Text numberOfLines={1} style={k.td}>
              {tag}
            </Text>
          </Pressable>
        </View>
      );
    }
    if (press) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${column.label}: ${text}`}
          style={[k.cellBtn, column.left ? k.cellBtnStart : k.cellBtnEnd]}
          onPress={press}>
          <Text numberOfLines={1} style={k.td}>
            {text}
          </Text>
        </Pressable>
      );
    }
    return (
      <Text numberOfLines={1} style={[k.td, !column.left && k.right]}>
        {text}
      </Text>
    );
  };
  /** The room kept, in every column, for what is under a row. */
  const gap = (row: DataRow) =>
    row.after ? <View style={{height: under[row.key] ?? 0}} /> : null;

  let bottom = s(HEAD);
  const overlays = rows.map(row => {
    bottom += s(ROW);
    if (!row.after) {
      return null;
    }
    const top = bottom;
    const known = under[row.key];
    bottom += known ?? 0;
    return (
      <View
        key={row.key}
        style={[k.dataUnder, {top}, known === undefined && k.unseen]}
        onLayout={event => {
          const height = Math.ceil(event.nativeEvent.layout.height);
          setUnder(now =>
            now[row.key] === height ? now : {...now, [row.key]: height},
          );
        }}>
        {row.after}
      </View>
    );
  });

  return (
    <>
      {choices && picking && <ColumnList choices={choices} />}
      <View style={k.dataTable}>
        <View style={k.dataFirst}>
          <View style={k.dataLine}>
            {title(first, 0)}
            {choices && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose the columns"
                accessibilityState={{expanded: picking}}
                style={k.columnsBtn}
                onPress={() => setPicking(!picking)}>
                <View style={[k.columnsIcon, picking && k.columnsIconOn]}>
                  <View style={k.columnsBar} />
                  <View style={k.columnsBar} />
                </View>
              </Pressable>
            )}
          </View>
          {rows.map(row => (
            <React.Fragment key={row.key}>
              <Pressable
                accessibilityRole={row.onPress ? 'button' : undefined}
                disabled={!row.onPress}
                style={k.dataRow}
                onPress={row.onPress}>
                <Text numberOfLines={1} style={row.plain ? k.td : k.tdBold}>
                  {row.cells[0]}
                </Text>
              </Pressable>
              {gap(row)}
            </React.Fragment>
          ))}
        </View>
        <ScrollView
          horizontal
          style={k.flex}
          contentContainerStyle={k.grow}
          persistentScrollbar
          overScrollMode="never">
          {rest.map((column, i) => (
            <View key={column.key} style={k.grow}>
              {title(column, i + 1)}
              {rows.map(row => (
                <React.Fragment key={row.key}>
                  <Pressable
                    disabled={!row.onPress}
                    style={[k.dataRow, k.dataCell]}
                    onPress={row.onPress}>
                    {inside(row, column, row.cells[i + 1])}
                  </Pressable>
                  {gap(row)}
                </React.Fragment>
              ))}
            </View>
          ))}
        </ScrollView>
        {overlays}
      </View>
    </>
  );
}

/** The columns picked for each table, and how to change them. */
export const PickedColumns = createContext<{
  picked: Record<string, string[]>;
  onPick: (table: string, keys: string[]) => void;
}>({picked: {}, onPick: () => {}});

/**
 * What a table can show. A column that is shown carries its place among
 * the others: columns come in the order they were picked.
 */
function ColumnList({choices}: {choices: ColumnChoices}) {
  const k = useKit();
  const {picked, onPick} = useContext(PickedColumns);
  const offered = choices.all.slice(1);
  const chosen =
    picked[choices.table] ??
    offered.filter(column => column.on).map(column => column.key);
  return (
    <View style={k.pickerList}>
      {offered.map(column => {
        const place = chosen.indexOf(column.key) + 1;
        const on = place > 0;
        return (
          <Pressable
            key={column.key}
            accessibilityRole="checkbox"
            accessibilityState={{checked: on}}
            accessibilityLabel={
              on ? `${column.label}, column ${place}` : column.label
            }
            style={[k.mini, k.tiny, k.choice, on && k.btnFilled]}
            onPress={() =>
              onPick(
                choices.table,
                on
                  ? chosen.filter(key => key !== column.key)
                  : [...chosen, column.key],
              )
            }>
            <View style={k.place}>
              {on && <Text style={k.placeText}>{place}</Text>}
            </View>
            <Text
              numberOfLines={1}
              style={[k.miniText, k.tinyText, on && k.btnTextFilled]}>
              {column.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Brand, state of the data, and the two actions common to every view. */
function Header(props: {
  status: string;
  busy: boolean;
  onRefresh: () => void;
  onExit: () => void;
  currency: string;
  onCurrency: () => void;
}) {
  const k = useKit();
  return (
    <View style={k.header}>
      <Text style={k.brand}>CRYPTOVIEW {APP_VERSION}</Text>
      <Text style={k.status} numberOfLines={2}>
        {props.status}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch between euros and dollars"
        disabled={props.busy}
        style={[k.refresh, k.exit]}
        onPress={props.onCurrency}>
        <Text style={k.refreshText}>{props.currency}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh"
        disabled={props.busy}
        style={[k.refresh, props.busy && k.refreshBusy]}
        onPress={props.onRefresh}>
        <Text style={[k.refreshText, props.busy && k.refreshTextBusy]}>
          {props.busy ? 'UPDATING' : 'REFRESH'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Exit"
        style={[k.refresh, k.exit]}
        onPress={props.onExit}>
        <Text style={k.refreshText}>EXIT</Text>
      </Pressable>
    </View>
  );
}

export interface NavItem<V extends string> {
  view: V;
  label: string;
  /** Kept at the foot of the menu, away from the views of the figures. */
  foot?: boolean;
  /** Its pages, listed under it while it is the current view. */
  pages?: {key: string; label: string}[];
}

interface ShellProps<V extends string> {
  nav: NavItem<V>[];
  /** The entry of the side menu shown as current. */
  current: V;
  onNav: (view: V) => void;
  /** The page shown of the current entry, when it has pages. */
  page?: string;
  onPage?: (view: V, page: string) => void;
  status: string;
  busy: boolean;
  onRefresh: () => void;
  onExit: () => void;
  /** The currency shown, as the header's switch names it. */
  currency: string;
  onCurrency: () => void;
  title: string;
  /** Small buttons at the end of the title. */
  titleAction?: React.ReactNode;
  /** Pinned to the bottom of the screen. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Lets a view know that its page was scrolled to the end. */
const PageEnd = createContext<{current: (() => void) | null}>({current: null});

/** Calls `reached` each time the page is scrolled down to its end. */
export function usePageEnd(reached: () => void): void {
  const listener = useContext(PageEnd);
  useEffect(() => {
    listener.current = reached;
    return () => {
      listener.current = null;
    };
  });
}

/**
 * Header, side menu and one view. The content scrolls; the buttons stay at
 * the bottom of the screen whatever its size.
 */
export function Shell<V extends string>(props: ShellProps<V>) {
  const k = useKit();
  const pageEnd = useRef<(() => void) | null>(null);
  const scrolled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset, layoutMeasurement, contentSize} = event.nativeEvent;
    // Within one row of the end is the end.
    if (
      contentOffset.y + layoutMeasurement.height >=
      contentSize.height - s(ROW)
    ) {
      pageEnd.current?.();
    }
  };
  const entry = (item: NavItem<V>) => {
    const now = item.view === props.current;
    return (
      <React.Fragment key={item.view}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: now}}
          style={k.navItem}
          onPress={() => props.onNav(item.view)}>
          <View style={[k.navMark, now && k.navMarkNow]} />
          <Text style={[k.navLabel, now && k.navLabelNow]}>{item.label}</Text>
        </Pressable>
        {now &&
          item.pages?.map(page => {
            const shown = page.key === props.page;
            return (
              <Pressable
                key={page.key}
                accessibilityRole="button"
                accessibilityState={{selected: shown}}
                style={[k.navPage, shown && k.navPageNow]}
                onPress={() => props.onPage?.(item.view, page.key)}>
                <Text
                  numberOfLines={1}
                  style={[k.navPageLabel, shown && k.navPageLabelNow]}>
                  {page.label}
                </Text>
              </Pressable>
            );
          })}
      </React.Fragment>
    );
  };
  return (
    <View style={k.screen}>
      <Header
        status={props.status}
        busy={props.busy}
        onRefresh={props.onRefresh}
        onExit={props.onExit}
        currency={props.currency}
        onCurrency={props.onCurrency}
      />
      <View style={k.columns}>
        <View style={k.nav}>
          {props.nav.filter(item => !item.foot).map(entry)}
          <View style={k.flex} />
          {props.nav.filter(item => item.foot).map(entry)}
        </View>
        <View style={k.main}>
          <ScrollView
            // A new view starts at its top.
            key={props.title}
            style={k.scroll}
            contentContainerStyle={k.content}
            keyboardShouldPersistTaps="handled"
            persistentScrollbar
            onScrollEndDrag={scrolled}
            onMomentumScrollEnd={scrolled}>
            <View style={k.titleRow}>
              <Text style={[k.h1, k.flex]}>{props.title}</Text>
              {props.titleAction}
            </View>
            <PageEnd.Provider value={pageEnd}>
              {props.children}
            </PageEnd.Provider>
          </ScrollView>
          {props.action && <View style={k.footer}>{props.action}</View>}
        </View>
      </View>
    </View>
  );
}
