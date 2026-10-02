/**
 * A single row of a CSV export.
 *
 * Keys are the column headers (the report pages build rows with human-readable
 * headers like `"Invoice No"` / `"Outstanding (Rs)"`); values are primitives that
 * `String()` renders sensibly. `null`/`undefined` are allowed because several
 * report sources (e.g. `collections.status`) are nullable — `Array.prototype.join`
 * renders those as an empty cell, exactly as before.
 */
export type CsvValue = string | number | boolean | null | undefined

export type CsvRow = Record<string, CsvValue>

/**
 * Serialises rows to CSV text: header row derived from the first row's keys,
 * then one line per row. Values containing a comma are quoted and embedded
 * quotes are doubled, per RFC 4180.
 */
export function rowsToCsv(data: CsvRow[]): string {
  // Extract headers dynamically from the first object
  const headers = Object.keys(data[0])

  return [
    headers.join(','), // Header row
    ...data.map(row =>
      headers.map(header => {
        const value = row[header]
        // Escape quotes and wrap in quotes if there's a comma
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }).join(',')
    )
  ].join('\n')
}