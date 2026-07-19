// Minimal, dependency-free parser for the <table> blocks used throughout
// the SRD markdown source. No npm HTML parser needed — the source's tables
// are simple and consistently formatted (tbody/thead td/th, occasional
// colspan on header-only rows).

/**
 * Extracts the first <table>...</table> block starting at or after `fromIndex`.
 * Returns { html, endIndex } or null if none found.
 */
function extractTable(text, fromIndex) {
  const start = text.indexOf('<table>', fromIndex)
  if (start === -1) return null
  const end = text.indexOf('</table>', start)
  if (end === -1) return null
  return { html: text.slice(start, end + '</table>'.length), endIndex: end + '</table>'.length, startIndex: start }
}

function stripTags(cell) {
  return cell
    .replace(/<[^>]+>/g, '')
    .replace(/’/g, "'") // normalize curly apostrophes — source mixes ' and ’ inconsistently
    .trim()
}

function parseRow(rowHtml, cellTag) {
  const re = new RegExp(`<${cellTag}([^>]*)>([\\s\\S]*?)</${cellTag}>`, 'g')
  const cells = []
  let m
  while ((m = re.exec(rowHtml))) {
    const colspanMatch = m[1].match(/colspan="(\d+)"/)
    const colspan = colspanMatch ? Number(colspanMatch[1]) : 1
    const text = stripTags(m[2]).replace(/\s+/g, ' ')
    for (let i = 0; i < colspan; i++) cells.push(text)
  }
  return cells
}

function parseRows(sectionHtml, cellTag) {
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g
  const rows = []
  let m
  while ((m = rowRe.exec(sectionHtml))) {
    rows.push(parseRow(m[1], cellTag))
  }
  return rows
}

/**
 * Parses a <table> block into { headers: string[], rows: string[][] }.
 * Handles the two-tier header pattern seen in caster class tables
 * (a colspan group-label row followed by a per-column numeric row) by
 * using the LAST header row that has as many non-empty cells as the
 * body's column count; falls back to the first header row otherwise.
 */
function parseTable(tableHtml) {
  const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/)
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/)
  const bodyHtml = tbodyMatch ? tbodyMatch[1] : tableHtml
  const rows = parseRows(bodyHtml, 'td')
  const colCount = rows.length > 0 ? Math.max(...rows.map((r) => r.length)) : 0

  let headers = []
  if (theadMatch) {
    // Colspans are expanded per-row above, so aligned header rows share
    // column indices. Later rows (more specific, e.g. per-column numbers)
    // win; earlier rows (group labels, e.g. spanning "Spell Slots...")
    // fill in any column a later row left blank.
    const headerRows = parseRows(theadMatch[1], 'th')
    headers = headerRows.reduce((acc, row) => {
      if (acc.length === 0) return row.slice()
      return acc.map((h, i) => (row[i] ? row[i] : h))
    }, [])
  }

  return { headers, rows }
}

module.exports = { extractTable, parseTable, stripTags }
