export function decodeHtmlEntities(input) {
  if (!input) return "";
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function stripTags(input) {
  if (!input) return "";
  return input.replace(/<[^>]+>/g, "");
}

export function htmlToText(input) {
  return decodeHtmlEntities(stripTags(input)).replace(/\s+/g, " ").trim();
}

export function parseDollarAmount(input) {
  if (!input) return null;
  const text = htmlToText(input);
  const match = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

export function parsePercent(input) {
  if (!input) return null;
  const text = htmlToText(input);
  if (/none|n\.a\.?/i.test(text)) return null;
  const match = text.match(/([\d.]+)\s*%/);
  if (!match) return null;
  return Number(match[1]) / 100;
}

export function parseTableRows(tableHtml) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml))) {
    const rowHtml = trMatch[1];
    const cells = [];
    const tdRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml))) {
      cells.push(tdMatch[1]);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

export function extractTableByHeaders(html, headerMarkers) {
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRegex.exec(html))) {
    const tableHtml = match[0];
    const hasAllHeaders = headerMarkers.every((marker) =>
      new RegExp(marker, "i").test(tableHtml)
    );
    if (hasAllHeaders) {
      return tableHtml;
    }
  }
  return null;
}
