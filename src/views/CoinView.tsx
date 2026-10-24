import React, {useEffect, useState} from 'react';
import {
  About,
  CHART_SPANS,
  ChartSpan,
  downsample,
  fetchAbout,
  fetchChart,
} from '../core/coingecko';
import {
  fmtChange,
  fmtLarge,
  fmtNumber,
  fmtPrice,
  fmtSignedPct,
  fmtSignedPrice,
  MONTHS,
} from '../core/format';
import {Currency, Quote} from '../core/model';
import {Line} from '../core/portfolio';
import {
  Between,
  Box,
  Btn,
  Chart,
  Column,
  Flex,
  H2,
  Label,
  P,
  Row,
  Small,
  TableHead,
  TableRow,
} from '../ui/kit';

const CHANGES: Column[] = [
  {label: 'Over', flex: 1},
  {label: 'Change', flex: 1, right: true},
];
const FACTS: Column[] = [
  {label: 'Market', flex: 0.8},
  {label: 'Value', flex: 1.4, right: true},
];
const SPAN_LABELS: Record<ChartSpan, string> = {
  1: '24h',
  7: '7 days',
  30: '30 days',
  365: '1 year',
};
/** Columns of the chart; more would be thinner than the screen can show. */
const COLUMNS = 90;

interface History {
  values: number[];
  low: number;
  high: number;
}
// Kept for the session: going back to a coin must not ask again.
const histories = new Map<string, History>();

/** The price over a chosen span, read when the coin is opened. */
function PriceChart({id, currency}: {id: string; currency: Currency}) {
  const [span, setSpan] = useState<ChartSpan>(7);
  const [, redraw] = useState(0);
  const [problem, setProblem] = useState('');
  const key = `${id}.${currency}.${span}`;
  const history = histories.get(key);
  useEffect(() => {
    if (histories.has(key)) {
      return;
    }
    let current = true;
    setProblem('');
    fetchChart(id, currency, span)
      .then(points => {
        const prices = points.map(point => point[1]);
        histories.set(key, {
          values: downsample(points, COLUMNS),
          low: Math.min(...prices),
          high: Math.max(...prices),
        });
        if (current) {
          redraw(n => n + 1);
        }
      })
      .catch(e => current && setProblem((e as Error).message));
    return () => {
      current = false;
    };
  }, [id, currency, span, key]);
  return (
    <>
      <Row>
        {CHART_SPANS.map(days => (
          <Flex key={days}>
            <Btn
              label={SPAN_LABELS[days]}
              selected={days === span}
              onPress={() => setSpan(days)}
            />
          </Flex>
        ))}
      </Row>
      <Chart values={history?.values ?? []} />
      {history ? (
        <Between>
          <Small>Low {fmtPrice(history.low, currency)}</Small>
          <Small>High {fmtPrice(history.high, currency)}</Small>
        </Between>
      ) : (
        <Small>
          {problem !== '' ? `No chart: ${problem}.` : 'Reading the chart...'}
        </Small>
      )}
    </>
  );
}

// Kept for the session, like the charts.
const abouts = new Map<string, About>();

/** What the coin is: asked from the price source only when wanted. */
function AboutCoin({id}: {id: string}) {
  const [, redraw] = useState(0);
  const [state, setState] = useState<'' | 'reading' | string>('');
  const about = abouts.get(id);
  if (!about) {
    return (
      <>
        <Btn
          label={state === 'reading' ? 'Reading...' : 'About this coin'}
          disabled={state === 'reading'}
          onPress={() => {
            setState('reading');
            fetchAbout(id)
              .then(read => {
                abouts.set(id, read);
                setState('');
                redraw(n => n + 1);
              })
              .catch(e => setState((e as Error).message));
          }}
        />
        {state !== '' && state !== 'reading' && (
          <Small>Not read: {state}.</Small>
        )}
      </>
    );
  }
  return (
    <>
      <Label>About</Label>
      <P>{about.description || 'The price source has no description.'}</P>
      {about.categories.length > 0 && (
        <Small>{about.categories.join(' · ')}</Small>
      )}
      {about.since !== '' && <Small>Started {about.since}.</Small>}
      {about.site !== '' && <Small>{about.site}</Small>}
    </>
  );
}

/** 14 NOV 2021, from the date the price source gives. */
const day = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) {
    return '';
  }
  return ` · ${d.getUTCDate()} ${
    MONTHS[d.getUTCMonth()]
  } ${d.getUTCFullYear()}`;
};

/** The price of a coin and what the user holds of it. */
export function CoinBox(props: {
  quote: Quote | undefined;
  currency: Currency;
  /** The portfolio line of the coin, when the user holds some. */
  held?: Line;
  /** Named so when the price source does not know the coin. */
  symbol?: string;
}) {
  const {quote, currency, held} = props;
  if (!quote) {
    return held && props.symbol ? (
      <Box>
        <H2>{props.symbol} · no price</H2>
        <P>
          You hold {fmtNumber(held.quantity)} {props.symbol}
        </P>
      </Box>
    ) : (
      <P>No price for this coin yet. Tap Refresh.</P>
    );
  }
  return (
    <Box>
      <H2>
        {quote.symbol} {fmtPrice(quote.price, currency)}
      </H2>
      <Small>
        {quote.name}
        {quote.rank > 0 ? ` · rank ${quote.rank}` : ''}
      </Small>
      {held && (
        <>
          <P>
            You hold {fmtNumber(held.quantity)} {quote.symbol} ·{' '}
            {fmtPrice(held.value, currency)}
          </P>
          {held.pnl !== null && (
            <Small>
              Gain {fmtSignedPrice(held.pnl, currency)}
              {held.pnlPct !== null ? ` (${fmtSignedPct(held.pnlPct)})` : ''}
              {held.pnlPartial ? ', on the coins with a price paid' : ''}
            </Small>
          )}
        </>
      )}
    </Box>
  );
}

/** Everything the price source says about one coin. */
export function MarketData({
  quote,
  currency,
}: {
  quote: Quote;
  currency: Currency;
}) {
  const c = quote.changes;
  const supply =
    quote.circulating == null
      ? '-'
      : fmtNumber(Math.round(quote.circulating)) +
        (quote.maxSupply
          ? ` of ${fmtNumber(Math.round(quote.maxSupply))} (${(
              (quote.circulating / quote.maxSupply) *
              100
            ).toFixed(0)}%)`
          : ', no maximum');
  return (
    <>
      <PriceChart id={quote.id} currency={currency} />
      <TableHead columns={CHANGES} />
      <TableRow columns={CHANGES} cells={['1 hour', fmtChange(c.h1)]} />
      <TableRow columns={CHANGES} cells={['24 hours', fmtChange(c.h24)]} />
      <TableRow columns={CHANGES} cells={['7 days', fmtChange(c.d7)]} />
      <TableRow columns={CHANGES} cells={['14 days', fmtChange(c.d14)]} />
      <TableRow columns={CHANGES} cells={['30 days', fmtChange(c.d30)]} />
      <TableRow columns={CHANGES} cells={['200 days', fmtChange(c.d200)]} />
      <TableRow columns={CHANGES} cells={['1 year', fmtChange(c.y1)]} />
      <TableHead columns={FACTS} />
      <TableRow
        columns={FACTS}
        cells={['24h high', fmtPrice(quote.high24h, currency)]}
      />
      <TableRow
        columns={FACTS}
        cells={['24h low', fmtPrice(quote.low24h, currency)]}
      />
      <TableRow
        columns={FACTS}
        cells={['Market cap', fmtLarge(quote.marketCap, currency)]}
      />
      <TableRow
        columns={FACTS}
        cells={['Volume 24h', fmtLarge(quote.volume ?? null, currency)]}
      />
      <TableRow
        columns={FACTS}
        cells={['Fully diluted', fmtLarge(quote.fdv ?? null, currency)]}
      />
      <TableRow columns={FACTS} cells={['Supply', supply]} />
      <TableRow
        columns={FACTS}
        cells={[
          'All-time high',
          fmtPrice(quote.ath, currency) + day(quote.athDate),
        ]}
      />
      <TableRow
        columns={FACTS}
        cells={['From all-time high', fmtChange(quote.athChange)]}
      />
      <TableRow
        columns={FACTS}
        cells={[
          'All-time low',
          fmtPrice(quote.atl ?? null, currency) + day(quote.atlDate),
        ]}
      />
      <TableRow
        columns={FACTS}
        cells={['From all-time low', fmtChange(quote.atlChange ?? null)]}
      />
      <AboutCoin id={quote.id} />
    </>
  );
}
