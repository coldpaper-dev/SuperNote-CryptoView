/**
 * News feeds: an RSS item becomes a title, a date, a summary and the
 * article as paragraphs, whatever HTML the site wraps it in.
 */
import {
  articleBlocks,
  blockText,
  decodeEntities,
  hasSubtitle,
  parseFeed,
  speaksOf,
  withoutPaidEnd,
} from '../src/core/news';

const feed = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Bitcoin &amp; ETH rally]]></title>
<link>https://example.com/a</link>
<pubDate>Fri, 16 Oct 2026 15:35:00 +0000</pubDate>
<description><![CDATA[<p>Short summary.</p>]]></description>
<content:encoded><![CDATA[<p>First <a href="x">paragraph</a> of the story, long enough to count.</p>
<figure><img src="y"/><figcaption>A picture</figcaption></figure>
<h2>A title</h2><ul><li>one point</li></ul><script>alert(1)</script>
<p>L&#8217;article continue&nbsp;ici.</p>]]></content:encoded></item>
<item><title>Older, summary only</title><link>https://example.com/b</link>
<pubDate>Thu, 15 Oct 2026 10:00:00 +0000</pubDate>
<description>Just this.</description></item>
</channel></rss>`;

describe('news', () => {
  it('reads the articles of a feed, newest first', () => {
    const [first, second] = parseFeed(feed);
    expect(first.title).toBe('Bitcoin & ETH rally');
    expect(first.link).toBe('https://example.com/a');
    expect(first.at).toBe(Date.UTC(2026, 9, 16, 15, 35));
    expect(first.summary).toBe('Short summary.');
    expect(first.body).toEqual([
      {
        kind: 'text',
        runs: [{text: 'First paragraph of the story, long enough to count.'}],
      },
      {kind: 'title', runs: [{text: 'A title'}]},
      {kind: 'item', runs: [{text: 'one point'}]},
      {kind: 'text', runs: [{text: 'L’article continue ici.'}]},
    ]);
    expect(hasSubtitle(first)).toBe(true);
    expect(second.body).toEqual([]);
    expect(second.summary).toBe('Just this.');
  });
  it('writes out character references', () => {
    expect(decodeEntities('&laquo;&#x20AC;&#233;&unknown;&raquo;')).toBe(
      '«€é&unknown;»',
    );
    expect(articleBlocks('<p>a</p><p></p><br/>b').map(blockText)).toEqual([
      'a',
      'b',
    ]);
  });
  it('keeps bold words, quotes and the opening of an article', () => {
    expect(
      articleBlocks(
        '<p>A <strong>big</strong> move.</p><blockquote><p>Said so.</p></blockquote><p>After.</p>',
      ),
    ).toEqual([
      {
        kind: 'text',
        runs: [{text: 'A '}, {text: 'big', bold: true}, {text: ' move.'}],
      },
      {kind: 'quote', runs: [{text: 'Said so.'}]},
      {kind: 'text', runs: [{text: 'After.'}]},
    ]);
    // A summary that is the first paragraph is not repeated above it.
    const article = {
      title: 't',
      link: '',
      at: 0,
      summary: 'A big move.',
      body: articleBlocks('<p>A <b>big</b> move. And more.</p>'),
    };
    expect(hasSubtitle(article)).toBe(false);
  });
  it('leaves the advertisements out', () => {
    const html =
      '<p>Real news, with a <a rel="sponsored" href="x">sponsored word</a> in it.</p>' +
      '<p><strong><a rel="noopener sponsored" href="y">Discover: The Best Token Presales</a></strong></p>' +
      '<div class="jdc-cta"><div class="cta-header">Bonus</div><a href="z">Join</a></div>' +
      '<p class="inline-news-ad">Subscribe to our newsletter.</p>' +
      '<a class="cta-content-button" rel="sponsored" href="w">Got</a><p> a gut feeling? Bet on it</p>' +
      '<h2>Next part</h2><p>More news.</p>' +
      '<p>The post Real news appeared first on Site.</p>';
    expect(articleBlocks(html).map(blockText)).toEqual([
      'Real news, with a sponsored word in it.',
      'Next part',
      'More news.',
    ]);
  });
  it('keeps the sentence an ad link sits in', () => {
    expect(
      articleBlocks(
        '<p>Bitcoin rose 5% today after the ETF news. <a class="cta-btn">Buy BTC</a> now</p>' +
          '<p>Next paragraph.</p>',
      ).map(blockText),
    ).toEqual(['Bitcoin rose 5% today after the ETF news.', 'Next paragraph.']);
  });
  it('cuts a last section that sells a token sale', () => {
    const blocks = articleBlocks(
      '<p>News.</p><h2>Analysis</h2><p>Facts.</p><h2>A new token</h2><p>Join the presale now.</p>',
    );
    expect(withoutPaidEnd(blocks).map(blockText)).toEqual([
      'News.',
      'Analysis',
      'Facts.',
    ]);
  });
  it('finds the articles about given coins', () => {
    const [first, second] = parseFeed(feed);
    const coins = [{symbol: 'ETH', name: 'Ethereum'}];
    expect(speaksOf(first, coins)).toBe(true);
    expect(speaksOf(second, coins)).toBe(false);
    expect(speaksOf(first, [{symbol: 'BTC', name: 'Bitcoin'}])).toBe(true);
    // A short symbol inside a word is not a mention.
    expect(speaksOf(first, [{symbol: 'ALL', name: 'Al'}])).toBe(false);
    // A name inside a longer word is not a mention either.
    const europe = {...first, title: 'European markets nearly flat'};
    expect(speaksOf(europe, [{symbol: 'EUR', name: 'Euro'}])).toBe(false);
    expect(speaksOf(europe, [{symbol: 'NEAR', name: 'Near'}])).toBe(false);
    expect(speaksOf(europe, [{symbol: 'XX', name: 'European markets'}])).toBe(
      true,
    );
  });
});
