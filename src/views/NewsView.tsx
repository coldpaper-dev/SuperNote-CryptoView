import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {fmtDate, fmtWhen} from '../core/format';
import {Article, Block, Feed, FeedRead, hasSubtitle} from '../core/news';
import {Btn, Flex, font, H2, INK, P, Row, s, Small} from '../ui/kit';
import {QrCode} from '../ui/QrCode';

// Made at each drawing: the scale and the fonts are known only then.
const styles = () => ({
  item: {
    paddingVertical: s(10),
    gap: s(4),
    borderTopWidth: 1,
    borderTopColor: INK,
  } as const,
  title: {fontSize: s(15), lineHeight: s(21), color: INK, ...font.monoBold},
  body: {fontSize: s(15), lineHeight: s(23), color: INK, ...font.mono},
  bold: {...font.monoBold},
  subtitle: {
    fontSize: s(16),
    lineHeight: s(24),
    color: INK,
    ...font.monoBold,
    paddingBottom: s(10),
    borderBottomWidth: s(2),
    borderBottomColor: INK,
  } as const,
  heading: {
    fontSize: s(18),
    lineHeight: s(25),
    color: INK,
    marginTop: s(8),
    ...font.monoBold,
  },
  bullet: {flexDirection: 'row', gap: s(8), paddingLeft: s(8)} as const,
  quote: {
    paddingLeft: s(12),
    borderLeftWidth: s(3),
    borderLeftColor: INK,
  } as const,
  grow: {flex: 1},
});

/** One block of an article, its bold words in bold. */
function BlockView({block}: {block: Block}) {
  const n = styles();
  const text = (
    <Text style={[block.kind === 'title' ? n.heading : n.body, n.grow]}>
      {block.runs.map((run, i) =>
        run.bold && block.kind !== 'title' ? (
          <Text key={i} style={n.bold}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
  if (block.kind === 'item') {
    return (
      <View style={n.bullet}>
        <Text style={n.body}>•</Text>
        {text}
      </View>
    );
  }
  return block.kind === 'quote' ? <View style={n.quote}>{text}</View> : text;
}

/** The articles of one feed, newest first; tap one to read it. */
export function NewsView(props: {
  feed: Feed;
  read: FeedRead | undefined;
  /** What the last read of this feed said went wrong, '' when nothing. */
  error: string;
  busy: boolean;
  /** Only the articles about the coins held or followed. */
  mine: boolean;
  onMine: (mine: boolean) => void;
  shown: Article[];
  onOpen: (article: Article) => void;
}) {
  const {read, shown} = props;
  const n = styles();
  return (
    <>
      <Row>
        <Flex>
          <Btn
            label="All"
            selected={!props.mine}
            onPress={() => props.onMine(false)}
          />
        </Flex>
        <Flex>
          <Btn
            label="About my coins"
            selected={props.mine}
            onPress={() => props.onMine(true)}
          />
        </Flex>
      </Row>
      {props.error !== '' && <P>Not read: {props.error}.</P>}
      {!read ? (
        <P>{props.busy ? 'Reading the feed...' : 'Not read yet.'}</P>
      ) : shown.length === 0 ? (
        <P>
          {props.mine
            ? 'No article of this feed names a coin you hold or follow.'
            : 'The feed is empty.'}
        </P>
      ) : (
        <View>
          {shown.map(article => (
            <Pressable
              key={article.link || article.title}
              accessibilityRole="button"
              style={n.item}
              onPress={() => props.onOpen(article)}>
              <Text style={n.title}>{article.title}</Text>
              <Small>
                {fmtWhen(article.at)}
                {article.body.length > 0 ? '' : ' · summary only'}
              </Small>
            </Pressable>
          ))}
        </View>
      )}
      {read && (
        <Small>
          {read.articles.length} articles from {props.feed.site}, read{' '}
          {fmtWhen(read.at)}. Tap Refresh to read the feed again.
        </Small>
      )}
    </>
  );
}

/** One article, as the feed gives it, and its address as a QR code. */
export function ArticleView(props: {feed: Feed; article: Article}) {
  const {article} = props;
  const n = styles();
  return (
    <>
      <H2>{article.title}</H2>
      <Small>
        {props.feed.label} · {fmtDate(article.at)}
      </Small>
      {article.body.length > 0 ? (
        <>
          {hasSubtitle(article) && (
            <Text style={n.subtitle}>{article.summary}</Text>
          )}
          {article.body.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </>
      ) : (
        <Text style={n.body}>{article.summary}</Text>
      )}
      {article.body.length === 0 && (
        <Small>The feed gives this summary only.</Small>
      )}
      {article.link !== '' && (
        <>
          <QrCode text={article.link} size={220} />
          <Small>Scan to open the article on a phone: {article.link}</Small>
        </>
      )}
    </>
  );
}
