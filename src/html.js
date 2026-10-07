'use strict';
// HTML and XML handling without a parser dependency. Job descriptions come
// from the web and are treated as untrusted data: everything is either
// stripped to plain text or re-emitted as the small HTML subset Telegram
// accepts, with every text node escaped.

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

const SCRIPT_OR_STYLE = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi;

/** Tags Telegram renders, keyed by the HTML tag name they map from. */
const TELEGRAM_INLINE_TAGS = {
  b: 'b', strong: 'b',
  i: 'i', em: 'i',
  u: 'u', ins: 'u',
  s: 's', strike: 's', del: 's',
  code: 'code', pre: 'pre',
};

/** Tags that end a line when they close. */
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'blockquote']);

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1].toLowerCase() === 'x';
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text: tags removed, entities decoded, whitespace collapsed. */
function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(String(html))
    .replace(SCRIPT_OR_STYLE, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts arbitrary HTML into the subset Telegram's `parse_mode: HTML`
 * accepts, keeping bold/italic/links/lists readable and truncating the
 * visible text at `maxChars`. Unknown tags are dropped, unclosed tags are
 * closed, and only http(s) links survive.
 */
function toTelegramHtml(html, maxChars = Infinity) {
  if (!html) return '';
  const input = decodeEntities(String(html)).replace(SCRIPT_OR_STYLE, ' ');
  const output = [];
  const openTags = []; // { name, close } in document order
  let remaining = maxChars;

  const appendText = (text) => {
    const visible = Array.from(text).slice(0, Math.max(0, remaining)).join('');
    if (!visible) return;
    output.push(escapeHtml(visible));
    remaining -= Array.from(visible).length;
  };

  const newline = () => {
    const last = output[output.length - 1];
    if (remaining > 0 && last && !last.endsWith('\n')) appendText('\n');
  };

  const closeBackTo = (name) => {
    const index = openTags.map((tag) => tag.name).lastIndexOf(name);
    if (index < 0) return;
    while (openTags.length > index) output.push(openTags.pop().close);
  };

  for (const token of input.match(/<[^>]*>|[^<]+|</g) || []) {
    if (!token.startsWith('<')) {
      appendText(token);
      continue;
    }
    const tag = /^<\s*(\/?)\s*([a-z][\w-]*)\b([^>]*)>$/i.exec(token);
    if (!tag) {
      appendText(token); // a stray "<" in prose
      continue;
    }
    const [, slash, rawName, attributes] = tag;
    const name = rawName.toLowerCase();
    const isClosing = slash === '/';

    if (name === 'br') { newline(); continue; }
    if (BLOCK_TAGS.has(name)) { if (isClosing) newline(); continue; }
    if (name === 'li') { isClosing ? newline() : appendText('• '); continue; }
    if (/^h[1-6]$/.test(name)) {
      if (isClosing) { output.push('</b>'); newline(); } else output.push('<b>');
      continue;
    }

    if (isClosing) { closeBackTo(name); continue; }

    if (name === 'a') {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const url = href && (href[1] || href[2] || href[3]);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      output.push(`<a href="${escapeHtml(url).replace(/"/g, '&quot;')}">`);
      openTags.push({ name, close: '</a>' });
      continue;
    }
    const telegramTag = TELEGRAM_INLINE_TAGS[name];
    if (telegramTag) {
      output.push(`<${telegramTag}>`);
      openTags.push({ name, close: `</${telegramTag}>` });
    }
  }
  while (openTags.length) output.push(openTags.pop().close);

  return output.join('')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text of the first `<name>` element in an XML string, CDATA unwrapped. */
function xmlTag(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!match) return '';
  const inner = match[1].trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
  return decodeEntities(inner).trim();
}

module.exports = { decodeEntities, escapeHtml, stripHtml, toTelegramHtml, xmlTag };
