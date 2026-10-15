import type { ITicket } from '../interfaces/ITicket';
import type { SlaState } from './sla';
export interface ISlaExportRow {ticket: ITicket; response: SlaState; resolution: SlaState;}
const escapeXml = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export function slaExportRows(rows: ISlaExportRow[]): string[][] {
  return [['Ticket ID', 'Title', 'Priority', 'First response SLA', 'Resolution SLA', 'Created (UTC)', 'First response (UTC)', 'Resolved (UTC)'], ...rows.map(({ticket, response, resolution}) => [String(ticket.Id), ticket.Title, ticket.Priority, response, resolution, ticket.Created, ticket.FirstRespondedAt || '', ticket.ResolvedAt || ''])];
}
// Store-only ZIP keeps workbook exports independent of third-party runtime libraries.
function zip(files: Array<[string, string]>): Uint8Array {
  const encoder = new TextEncoder(); const local: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const crc = (bytes: Uint8Array): number => {let value = 0xffffffff; for (const byte of bytes) {value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);} return (value ^ 0xffffffff) >>> 0;};
  for (const [name, content] of files) {
    const filename = encoder.encode(name); const data = encoder.encode(content); const checksum = crc(data);
    const header = new Uint8Array(30 + filename.length); const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(12, 33, true); view.setUint32(14, checksum, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, filename.length, true); header.set(filename, 30);
    const directory = new Uint8Array(46 + filename.length); const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true); directoryView.setUint16(8, 0x800, true); directoryView.setUint16(14, 33, true); directoryView.setUint32(16, checksum, true); directoryView.setUint32(20, data.length, true); directoryView.setUint32(24, data.length, true); directoryView.setUint16(28, filename.length, true); directoryView.setUint32(42, offset, true); directory.set(filename, 46);
    local.push(header, data); central.push(directory); offset += header.length + data.length;
  }
  const centralLength = central.reduce((sum, item) => sum + item.length, 0); const end = new Uint8Array(22); const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, centralLength, true); view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralLength + end.length); let position = 0;
  for (const bytes of [...local, ...central, end]) {result.set(bytes, position); position += bytes.length;} return result;
}
export function slaWorkbook(rows: ISlaExportRow[]): Uint8Array {
  const data = slaExportRows(rows);
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="55" customWidth="1"/><col min="3" max="8" width="25" customWidth="1"/></cols><sheetData>' + data.map((row, index) => `<row r="${index + 1}">${row.map((cell, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`).join('')}</row>`).join('') + `</sheetData><autoFilter ref="A1:H${data.length}"/></worksheet>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Missed SLA" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet]
  ]);
}
export function downloadSlaExcel(rows: ISlaExportRow[]): void {
  const bytes = slaWorkbook(rows);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link = document.createElement('a'); link.href = url; link.download = `DeskPilot-Missed-SLA-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printSlaPdf(rows: ISlaExportRow[]): void {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow popups to open the PDF print view, then try again.');
  popup.opener = null;
  const [head, ...body] = slaExportRows(rows);
  popup.document.write(`<!doctype html><html><head><title>DeskPilot — Tickets that missed SLA</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px "Segoe UI",Arial;color:#172536}h1{font-size:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border-bottom:1px solid #d6dfed;padding:7px;text-align:left;overflow-wrap:anywhere;vertical-align:top}th{background:#eef2f7}thead{display:table-header-group}tr{break-inside:avoid}th:nth-child(2){width:24%}.print{padding:8px 16px;margin:10px 0}@media print{.print{display:none}}</style></head><body><h1>Tickets that missed SLA</h1><p>${rows.length} tickets · Current dashboard filters · 24/7 elapsed time · Exported ${escapeXml(new Date().toISOString())}</p><button class="print" onclick="window.print()">Print / Save as PDF</button><table><thead><tr>${head.map(cell => `<th>${escapeXml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  popup.document.close(); popup.focus(); popup.setTimeout(() => popup.print(), 250);
}
