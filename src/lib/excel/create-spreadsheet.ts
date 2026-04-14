import ExcelJS from "exceljs";
import type { AiExcelData } from "@/lib/schemas";

const PRIMARY_COLOR = "1e40af";
const HEADER_FILL = "1e3a5f";
const EVEN_ROW_FILL = "f1f5f9";
const ODD_ROW_FILL = "ffffff";

function safeFilename(value: string) {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${ascii || "spreadsheet"}-${Date.now()}.xlsx`;
}

export async function renderExcelToBuffer(data: AiExcelData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AI DocHub";
  workbook.created = new Date();

  for (const sheet of data.sheets) {
    const ws = workbook.addWorksheet(sheet.name);

    // Set column widths
    ws.columns = sheet.headers.map((header, idx) => ({
      header,
      key: `col${idx}`,
      width: sheet.columnWidths?.[idx] || Math.max(header.length + 4, 15),
    }));

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: "Calibri" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${HEADER_FILL}` },
      };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: `FF${PRIMARY_COLOR}` } },
        bottom: { style: "thin", color: { argb: `FF${PRIMARY_COLOR}` } },
        left: { style: "thin", color: { argb: "FFcbd5e1" } },
        right: { style: "thin", color: { argb: "FFcbd5e1" } },
      };
    });
    headerRow.height = 28;

    // Add data rows
    for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
      const rowData = sheet.rows[rowIdx];
      const dataObj: Record<string, string | number> = {};
      rowData.forEach((cell, colIdx) => {
        dataObj[`col${colIdx}`] = cell;
      });
      const row = ws.addRow(dataObj);

      const fillColor = rowIdx % 2 === 0 ? EVEN_ROW_FILL : ODD_ROW_FILL;
      row.eachCell((cell) => {
        cell.font = { size: 11, name: "Calibri" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${fillColor}` },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFe2e8f0" } },
          left: { style: "thin", color: { argb: "FFe2e8f0" } },
          right: { style: "thin", color: { argb: "FFe2e8f0" } },
        };

        // Auto-detect and format numbers
        if (typeof cell.value === "number") {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        }
      });
      row.height = 22;
    }

    // Auto-filter
    if (sheet.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: sheet.rows.length + 1, column: sheet.headers.length },
      };
    }

    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: safeFilename(data.title),
  };
}
