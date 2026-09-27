import { describe, it, expect } from "vitest";
import { csvEscape, csvResponse, csvTimestamp, toCsv } from "@/lib/csv";

/**
 * CSV serializer tests: field escaping (quotes, commas, newlines), header
 * and row serialization with CRLF line endings, and the download response
 * headers used by the export endpoints.
 */

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("Bangla")).toBe("Bangla");
    expect(csvEscape("Class Nine (Science)")).toBe("Class Nine (Science)");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(true)).toBe("true");
  });

  it("returns an empty field for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes fields containing a comma", () => {
    expect(csvEscape("Karim, Rezaul")).toBe('"Karim, Rezaul"');
  });

  it("quotes fields containing a double quote and doubles it", () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes fields containing line breaks and keeps them inside quotes", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("does not quote an empty string (empty CSV field)", () => {
    expect(csvEscape("")).toBe("");
  });
});

describe("toCsv", () => {
  it("serializes the header and rows with CRLF endings and a trailing CRLF", () => {
    const csv = toCsv(
      ["Roll", "Name", "Class"],
      [
        [1, "Rezaul Karim", "Class Nine (Science)"],
        [2, "Nusrat, Jahan", "Class Nine (Science)"],
      ],
    );
    expect(csv).toBe(
      "Roll,Name,Class\r\n" +
        "1,Rezaul Karim,Class Nine (Science)\r\n" +
        '2,"Nusrat, Jahan",Class Nine (Science)\r\n',
    );
  });

  it("renders empty cells for missing values", () => {
    const csv = toCsv(["A", "B"], [[1, null]]);
    expect(csv).toBe("A,B\r\n1,\r\n");
  });

  it("produces a header-only document when there are no rows", () => {
    expect(toCsv(["Roll", "Name"], [])).toBe("Roll,Name\r\n");
  });
});

describe("csvResponse", () => {
  it("serves text/csv with an attachment filename and no-store", () => {
    const response = csvResponse("edutrack-students.csv", "Roll,Name\r\n");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="edutrack-students.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("csvTimestamp", () => {
  it("formats a UTC timestamp for filenames", () => {
    expect(csvTimestamp(new Date("2026-09-27T14:05:09.000Z"))).toBe("20260927-1405");
  });
});
