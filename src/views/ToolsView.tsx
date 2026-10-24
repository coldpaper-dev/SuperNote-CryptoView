import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {decimalText, fmtNumber, fmtPct, fmtPrice} from '../core/format';
import {Currency} from '../core/model';
import {averageCost, convert, leveraged, plain, Unit} from '../core/tools';
import {
  Box,
  Btn,
  Field,
  Flex,
  Label,
  MiniBtn,
  P,
  Row,
  s,
  Small,
} from '../ui/kit';

export type Tool = 'converter' | 'average' | 'leverage';
export const TOOLS: [Tool, string][] = [
  ['converter', 'Converter'],
  ['average', 'Average price'],
  ['leverage', 'Leverage'],
];

const t = StyleSheet.create({
  line: {flexDirection: 'row', alignItems: 'center', gap: s(10)},
  name: {width: s(110)},
  grow: {flex: 1},
});

/** A number typed, or null while the field is empty or unfinished. */
const typed = (text: string): number | null =>
  /\d/.test(text) && isFinite(Number(text)) ? Number(text) : null;

interface ConverterProps {
  /** Euro and dollar, then the coins picked that have a price. */
  units: Unit[];
  /** Coins picked that have no price yet, by id, with their symbol. */
  waiting: {id: string; symbol: string}[];
  onRemove: (id: string) => void;
  onAdd: () => void;
}

/**
 * One amount typed in any unit fills every other. Euro and dollar are
 * always there; the coins are the user's to add and remove.
 */
function Converter({units, waiting, onRemove, onAdd}: ConverterProps) {
  const [from, setFrom] = useState({key: '', text: ''});
  const source = units.find(unit => unit.key === from.key);
  const amount = typed(from.text);
  if (units.length < 2 && waiting.length === 0) {
    return <P>No price read yet. Open Portfolio or Market and refresh.</P>;
  }
  const currency = (key: string) => key === 'eur' || key === 'usd';
  return (
    <>
      {units.map(unit => (
        <View key={unit.key} style={t.line}>
          <View style={t.name}>
            <Label>{unit.label}</Label>
          </View>
          <View style={t.grow}>
            <Field
              value={
                unit.key === from.key
                  ? from.text
                  : source && amount !== null
                  ? plain(convert(amount, source, unit))
                  : ''
              }
              onChangeText={text =>
                setFrom({key: unit.key, text: decimalText(text)})
              }
              placeholder="0"
            />
          </View>
          {!currency(unit.key) && (
            <MiniBtn label="×" onPress={() => onRemove(unit.key)} />
          )}
        </View>
      ))}
      {waiting.map(coin => (
        <View key={coin.id} style={t.line}>
          <View style={t.name}>
            <Label>{coin.symbol}</Label>
          </View>
          <View style={t.grow}>
            <Small>No price yet: tap Refresh.</Small>
          </View>
          <MiniBtn label="×" onPress={() => onRemove(coin.id)} />
        </View>
      ))}
      <Btn label="Add a coin" onPress={onAdd} />
      <Small>
        Type an amount on any line, at the prices last read; USDC counts as one
        dollar.
      </Small>
    </>
  );
}

/** Several buys of one coin, and the price they average to. */
function Average({currency}: {currency: Currency}) {
  const [buys, setBuys] = useState([
    {quantity: '', price: ''},
    {quantity: '', price: ''},
    {quantity: '', price: ''},
  ]);
  const set = (index: number, field: 'quantity' | 'price', text: string) =>
    setBuys(
      buys.map((buy, i) =>
        i === index ? {...buy, [field]: decimalText(text)} : buy,
      ),
    );
  const result = averageCost(
    buys
      .map(buy => ({quantity: typed(buy.quantity), price: typed(buy.price)}))
      .filter(
        (buy): buy is {quantity: number; price: number} =>
          buy.quantity !== null && buy.price !== null,
      ),
  );
  return (
    <>
      {buys.map((buy, i) => (
        <View key={i} style={t.line}>
          <View style={t.grow}>
            <Field
              value={buy.quantity}
              onChangeText={text => set(i, 'quantity', text)}
              placeholder="Quantity"
            />
          </View>
          <View style={t.grow}>
            <Field
              value={buy.price}
              onChangeText={text => set(i, 'price', text)}
              placeholder="Price of one"
            />
          </View>
        </View>
      ))}
      <Row>
        <Flex>
          <Btn
            label="Add a buy"
            onPress={() => setBuys([...buys, {quantity: '', price: ''}])}
          />
        </Flex>
        <Flex>
          <Btn
            label="Clear"
            onPress={() =>
              setBuys(buys.slice(0, 3).map(() => ({quantity: '', price: ''})))
            }
          />
        </Flex>
      </Row>
      {result && (
        <Box>
          <Label>Average price</Label>
          <P>{fmtPrice(result.average, currency)}</P>
          <Small>
            {fmtNumber(result.quantity)} coins for{' '}
            {fmtPrice(result.spent, currency)}
          </Small>
        </Box>
      )}
      <Small>
        One line per buy; a price of 0 is a coin received for free. The average
        is what to type as "Paid / coin" in the portfolio. Fees are not counted
        unless you add them to the prices.
      </Small>
    </>
  );
}

/** Size and liquidation price of a position from its margin and leverage. */
function Leverage({currency}: {currency: Currency}) {
  const [long, setLong] = useState(true);
  const [text, setText] = useState({
    entry: '',
    margin: '',
    leverage: '',
    max: '',
  });
  const field = (key: keyof typeof text, placeholder: string) => (
    <Field
      value={text[key]}
      onChangeText={value => setText({...text, [key]: decimalText(value)})}
      placeholder={placeholder}
    />
  );
  const leverage = typed(text.leverage);
  const result =
    leverage === null
      ? null
      : leveraged({
          entry: typed(text.entry) ?? 0,
          margin: typed(text.margin) ?? 0,
          leverage,
          // Without the market's limit, the leverage typed is taken as it.
          maxLeverage: typed(text.max) ?? leverage,
          long,
        });
  return (
    <>
      <Row>
        <Flex>
          <Btn label="Long" selected={long} onPress={() => setLong(true)} />
        </Flex>
        <Flex>
          <Btn label="Short" selected={!long} onPress={() => setLong(false)} />
        </Flex>
      </Row>
      <View style={t.line}>
        <View style={t.grow}>{field('entry', 'Entry price')}</View>
        <View style={t.grow}>{field('margin', 'Margin')}</View>
      </View>
      <View style={t.line}>
        <View style={t.grow}>{field('leverage', 'Leverage (5 for 5x)')}</View>
        <View style={t.grow}>{field('max', 'Max leverage of the market')}</View>
      </View>
      {result && (
        <Box>
          <Label>Liquidation price</Label>
          <P>
            {result.liquidation === null
              ? 'None: the position cannot be liquidated.'
              : `${fmtPrice(result.liquidation, currency)}, ` +
                `${fmtPct(result.distance)} from the entry`}
          </P>
          <Small>
            Position {fmtPrice(result.size, currency)},{' '}
            {fmtNumber(result.quantity)} coins
          </Small>
        </Box>
      )}
      <Small>
        An isolated position, as Hyperliquid liquidates it: the margin to keep
        is half the margin asked at the market's highest leverage (40x for BTC,
        less for smaller coins). Fees and funding are left out; the exchange's
        own figure is the one that counts.
      </Small>
    </>
  );
}

/** Small calculators; none of them reads the network. */
/** The tool picked in the side menu. */
export function ToolsView(
  props: {tool: Tool; currency: Currency} & ConverterProps,
) {
  const {tool, currency, ...converter} = props;
  return (
    <>
      {tool === 'converter' && <Converter {...converter} />}
      {tool === 'average' && <Average currency={currency} />}
      {tool === 'leverage' && <Leverage currency={currency} />}
    </>
  );
}
