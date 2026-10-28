import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { recordExportFileName, writeRecordExport } from '../../../lib/record-export';

const table = {
	headers: ['Habitat', 'Inspection date', 'Recorded', 'Larvae'],
	rows: [
		['=HYPERLINK("http://example.test","x")', '2026-09-02', '2026-09-02 21:15', 12],
		['-ditch', '2026-09-03', null, -1],
	],
};

describe('writeRecordExport', () => {
	it('writes a CSV that opens no cell as a formula', async () => {
		const blob = await writeRecordExport('csv', 'Inspections', table);

		const lines = (await blob.text()).split('\n');
		expect(lines[0]).toBe('Habitat,Inspection date,Recorded,Larvae');
		expect(lines[1]).toBe(
			`"'=HYPERLINK(""http://example.test"",""x"")",2026-09-02,2026-09-02 21:15,12`,
		);
		// A number keeps its sign; only text is guarded.
		expect(lines[2]).toBe("'-ditch,2026-09-03,,-1");
	});

	it('writes dates and times into the workbook as date cells on the clock the server wrote', async () => {
		const blob = await writeRecordExport('xlsx', 'Inspections', table);

		const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array', cellDates: true });
		const sheet = workbook.Sheets.Inspections;
		expect(sheet?.A2?.v).toBe('=HYPERLINK("http://example.test","x")');
		expect(sheet?.A2?.t).toBe('s');
		expect(sheet?.B2?.t).toBe('d');
		expect(sheet?.B2?.w).toBe('2026-09-02');
		expect(sheet?.C2?.t).toBe('d');
		expect(sheet?.C2?.w).toBe('2026-09-02 21:15');
		expect(sheet?.D3?.v).toBe(-1);

		// The serial Excel stores is the wall-clock value, not one moved by a zone.
		const serials = XLSX.read(await blob.arrayBuffer(), { type: 'array' }).Sheets.Inspections;
		expect(serials?.C2?.v).toBeCloseTo(46267.885416666664, 6);
	});
});

describe('recordExportFileName', () => {
	it('names the file for the records and the day', () => {
		expect(recordExportFileName('Inspections', '2026-10-28', 'xlsx')).toBe(
			'Inspections 2026-10-28.xlsx',
		);
	});
});
