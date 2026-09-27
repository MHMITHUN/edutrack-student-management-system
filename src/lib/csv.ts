/**
 * CSV serialization for the export endpoints (admin students / class results,
 * teacher attendance summary). RFC 4180-style escaping; every export row is
 * built from real store queries — the serializer only formats.
 */

export type CsvCell = string | number | boolean | null | undefined;

/**
 * Escape one field: numbers/booleans pass through, null/undefined become
 * empty, and strings containing quotes, commas or newlines are wrapped in
 * double quotes with inner quotes doubled.
 */
export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (str === "") return "";
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Serialize a table: one header row plus data rows, joined with CRLF line
 * endings (RFC 4180) and a trailing newline, ready to serve as text/csv.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}

/** Build a text/csv download Response with a given filename. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Timestamp fragment for export filenames, e.g. "20260927-1430" (UTC). */
export function csvTimestamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}
