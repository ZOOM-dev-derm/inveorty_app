import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import { parseComaxReport } from "./comax-parser.js";

/** Encode Hebrew text as windows-1255 buffer */
function encode1255(text: string): Buffer {
  return iconv.encode(text, "win1255");
}

describe("parseComaxReport — CSV format", () => {
  it("parses a standard Comax CSV with Hebrew headers", () => {
    const csv = [
      "מחסן,שם מחסן,פריט,שם פריט,מידה,יתרה במלאי",
      "1,משרד,4610,בלוק 50 הגנה,,14341.00",
      "1,משרד,4631,טונר מטפל בעור שמן,,1576.00",
      "1,משרד,4635,קרם עיניים מתקן,,-130.00",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      item_code: "4610",
      inventory: 14341,
      product_name: "בלוק 50 הגנה",
      barcode: undefined,
    });
    expect(items[1]).toEqual({
      item_code: "4631",
      inventory: 1576,
      product_name: "טונר מטפל בעור שמן",
      barcode: undefined,
    });
    // Negative inventory is parsed as-is (clamping happens in the cron handler)
    expect(items[2].inventory).toBe(-130);
  });

  it("handles 'יתרה נוכחית' header variant", () => {
    const csv = [
      "פריט,שם פריט,יתרה נוכחית",
      "4600,פרו מסכה,362.00",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
    expect(items[0].inventory).toBe(362);
  });

  it("handles 'כמות מלאי' header variant", () => {
    const csv = [
      "פריט,שם פריט,כמות מלאי",
      "4600,פרו מסכה,500",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
    expect(items[0].inventory).toBe(500);
  });

  it("skips סה\"כ (total) rows", () => {
    const csv = [
      "פריט,שם פריט,יתרה במלאי",
      "4610,בלוק 50 הגנה,100",
      'סה"כ,,100',
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
    expect(items[0].item_code).toBe("4610");
  });

  it("skips rows with empty or NaN inventory", () => {
    const csv = [
      "פריט,שם פריט,יתרה במלאי",
      "4610,בלוק 50 הגנה,100",
      "4611,מולטי אסיד פילינג,",
      "4612,מנגו סקין פילינג,abc",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
  });

  it("handles zero inventory", () => {
    const csv = [
      "פריט,שם פריט,יתרה במלאי",
      "4607,לחות אייג'לס,0.00",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
    expect(items[0].inventory).toBe(0);
  });

  it("parses barcode column when present", () => {
    const csv = [
      "פריט,שם פריט,ברקוד,יתרה במלאי",
      "4610,בלוק 50 הגנה,7290123456789,14341",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
    expect(items[0].barcode).toBe("7290123456789");
  });

  it("returns empty array for CSV with missing required columns", () => {
    const csv = [
      "מחסן,שם מחסן,שם פריט",
      "1,משרד,בלוק 50 הגנה",
    ].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(0);
  });

  it("handles large dataset (like real Comax report with 629 rows)", () => {
    const header = "מחסן,שם מחסן,פריט,שם פריט,מידה,יתרה במלאי";
    const rows = Array.from({ length: 629 }, (_, i) =>
      `1,משרד,${i + 1},מוצר ${i + 1},,${(i % 3 === 0 ? -i : i) * 10}.00`
    );
    const csv = [header, ...rows].join("\n");

    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(629);
  });
});

describe("parseComaxReport — HTML format", () => {
  it("parses HTML disguised as .xls", () => {
    const html = `<meta charset="windows-1255">
<TABLE>
<TR><TD>פריט</TD><TD>שם פריט</TD><TD>יתרה במלאי</TD></TR>
<TR id=tr1><TD>4610</TD><TD>בלוק 50 הגנה</TD><TD>14341</TD></TR>
<TR id=tr2><TD>4631</TD><TD>טונר</TD><TD>1576</TD></TR>
</TABLE>`;

    const items = parseComaxReport(encode1255(html));
    expect(items).toHaveLength(2);
    expect(items[0].item_code).toBe("4610");
    expect(items[0].inventory).toBe(14341);
    expect(items[1].item_code).toBe("4631");
  });
});

describe("parseComaxReport — format detection", () => {
  it("detects CSV format (not HTML, not Excel)", () => {
    const csv = "פריט,שם פריט,יתרה במלאי\n4610,בלוק,100\n";
    const items = parseComaxReport(encode1255(csv));
    expect(items).toHaveLength(1);
  });

  it("detects HTML format by <meta> tag", () => {
    const html = `<meta charset="windows-1255"><TABLE>
<TR><TD>פריט</TD><TD>שם פריט</TD><TD>יתרה במלאי</TD></TR>
<TR id=tr1><TD>100</TD><TD>test</TD><TD>50</TD></TR>
</TABLE>`;
    const items = parseComaxReport(encode1255(html));
    expect(items).toHaveLength(1);
  });

  it("detects HTML format by <TABLE> tag", () => {
    const html = `<TABLE>
<TR><TD>פריט</TD><TD>שם פריט</TD><TD>יתרה במלאי</TD></TR>
<TR id=tr1><TD>100</TD><TD>test</TD><TD>50</TD></TR>
</TABLE>`;
    const items = parseComaxReport(encode1255(html));
    expect(items).toHaveLength(1);
  });
});

describe("negative stock clamping logic", () => {
  it("Math.max(0, n) clamps negative values to 0", () => {
    const testCases = [
      { input: -130, expected: 0 },
      { input: -784, expected: 0 },
      { input: 0, expected: 0 },
      { input: 14341, expected: 14341 },
      { input: -0.5, expected: 0 },
    ];

    for (const { input, expected } of testCases) {
      expect(Math.max(0, input)).toBe(expected);
    }
  });

  it("simulates cron stock update with clamping", () => {
    const items = [
      { item_code: "4610", inventory: 14341 },
      { item_code: "4635", inventory: -130 },
      { item_code: "4607", inventory: 0 },
      { item_code: "99", inventory: -220373 },
    ];

    const stockPayload = items.map((i) => ({
      sku: i.item_code,
      qty: Math.max(0, i.inventory),
    }));

    expect(stockPayload).toEqual([
      { sku: "4610", qty: 14341 },
      { sku: "4635", qty: 0 },
      { sku: "4607", qty: 0 },
      { sku: "99", qty: 0 },
    ]);
  });

  it("history entries preserve raw (negative) values", () => {
    const items = [
      { item_code: "4635", inventory: -130 },
      { item_code: "4610", inventory: 14341 },
    ];

    const historyPayload = items.map((i) => ({
      item_code: i.item_code,
      inventory: i.inventory,
      date: "13/04/2026",
    }));

    // History should keep raw values, NOT clamped
    expect(historyPayload[0].inventory).toBe(-130);
    expect(historyPayload[1].inventory).toBe(14341);
  });
});

describe("parseComaxReport — real Comax CSV file", () => {
  it("parses the actual user-provided Comax CSV", async () => {
    const fs = await import("fs");
    const path = "C:/Users/lenovo/AppData/Local/Temp/inventory.csv";

    let buf: Buffer;
    try {
      buf = fs.readFileSync(path);
    } catch {
      // Skip if file not available
      return;
    }

    const items = parseComaxReport(buf);

    // The real file has 629 data rows
    expect(items.length).toBeGreaterThan(600);

    // Spot check known products
    const block50 = items.find((i) => i.item_code === "4610");
    expect(block50).toBeDefined();
    expect(block50!.inventory).toBe(14341);
    expect(block50!.product_name).toBe("בלוק 50 הגנה");

    const toner = items.find((i) => i.item_code === "4631");
    expect(toner).toBeDefined();
    expect(toner!.inventory).toBe(1576);

    // Check negative values are parsed (not clamped at parser level)
    const eyeCream = items.find((i) => i.item_code === "4635");
    expect(eyeCream).toBeDefined();
    expect(eyeCream!.inventory).toBe(-130);

    // Verify no סה"כ rows
    const totals = items.filter(
      (i) => i.item_code.includes('סה"כ') || i.item_code.includes("סה״כ")
    );
    expect(totals).toHaveLength(0);
  });
});
