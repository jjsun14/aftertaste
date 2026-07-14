/**
 * File intake for the import flow: pick a .csv or .xlsx/.xls and return
 * its contents as CSV text, which feeds the exact same parse pipeline as
 * paste (lib/importParse). Google Takeout ships its saved lists as CSVs
 * inside a zip — the user unzips and picks one list file (e.g.
 * "Want to go.csv", "Favorite places.csv").
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

export interface PickedImportFile {
  fileName: string;
  text: string; // CSV text (Excel sheets are converted before returning)
}

const PICKER_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

/** Resolves null when the user cancels the picker; throws on read failure. */
export async function pickImportFile(): Promise<PickedImportFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  const asset = res.assets[0];
  const fileName = asset.name ?? 'file';

  if (/\.xlsx?$/i.test(fileName)) {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { fileName, text: excelToCsv(base64) };
  }

  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!text.trim()) throw new Error('That file looks empty.');
  return { fileName, text };
}

/**
 * Convert the busiest sheet of a workbook to CSV text. Cells keep their
 * displayed formatting, so Excel dates arrive as strings like
 * "11/14/2025" — which parseDateCell already understands.
 */
function excelToCsv(base64: string): string {
  const wb = XLSX.read(base64, { type: 'base64' });
  let best = '';
  let bestLines = 0;
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    const lines = csv.split('\n').filter((l) => l.replace(/,/g, '').trim()).length;
    if (lines > bestLines) {
      best = csv;
      bestLines = lines;
    }
  }
  if (bestLines === 0) throw new Error('That spreadsheet looks empty.');
  return best;
}
