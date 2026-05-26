/**
 * @file excel-generator.ts
 * @module lib
 *
 * Excel generation utility using `exceljs`.
 *
 * Generates `.xlsx` buffers for attendance reports and data exports.
 */

import { Buffer } from 'buffer';
import ExcelJS from 'exceljs';

/**
 * Generates an Excel workbook buffer from the provided rows.
 *
 * @param sheetName - Name of the worksheet tab.
 * @param headers   - Column header strings.
 * @param rows      - Array of row value arrays (must match header count).
 * @returns A promise resolving to the `.xlsx` file as a `Buffer`.
 */
export async function generateExcel(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | Date>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));

  for (const row of rows) {
    sheet.addRow(row);
  }

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B5E20' }, // KWASU green
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
