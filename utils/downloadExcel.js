/**
 * Generate an Excel workbook from an array of objects and stream it to the client as an .xlsx attachment.
 *
 * Creates a worksheet named "Data", uses the keys of the first object in `data` as column headers
 * (styled with bold white text on a blue background), writes each object as a row, auto-sizes columns,
 * and writes the resulting workbook to the provided Express response with appropriate content headers.
 *
 * @async
 * @function downloadExcel
 * @param {Array<Object>} data - Array of objects representing rows. The keys of the first object are used as column headers. Must be non-empty.
 * @param {string} filename - Base filename (without extension) to send to the client; the response will be named `${filename}.xlsx`.
 * @param {import('express').Response} res - Express response object to which the workbook will be written. The function sets
 *                                           'Content-Type' and 'Content-Disposition' headers and writes the workbook stream to this response.
 * @returns {Promise<void>} Resolves when the workbook has been successfully written to the response stream.
 * @throws {Error} May throw if `data` is empty/invalid or if writing the workbook to the response fails.
 */
const ExcelJS = require('exceljs');

async function downloadExcel(data, filename, res) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Add header row with styling
  worksheet.addRow(headers).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  data.forEach(item => {
    const row = headers.map(header => item[header]);
    worksheet.addRow(row);
  });

  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

  await workbook.xlsx.write(res);

}

module.exports = downloadExcel;
