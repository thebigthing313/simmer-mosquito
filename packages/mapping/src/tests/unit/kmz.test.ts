import { describe, expect, it } from 'vitest';
import { readImportFileText } from '../../geometry-import.js';
import { extractKmlFromKmz, isZipArchive, readZipEntries } from '../../kmz.js';

/**
 * These build real archives rather than checking in a binary fixture: the reader's
 * whole job is to agree with what a ZIP writer emits, and a fixture would fix that
 * agreement at one writer's choices. `buildZip` writes both compression methods
 * ZIP actually uses, so `stored: true` and the deflate default cover both branches.
 */

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>North basin</name><Polygon><outerBoundaryIs><LinearRing>
<coordinates>0,0 0,1 1,1 1,0 0,0</coordinates>
</LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;

interface ZipInput {
	readonly name: string;
	readonly content: string;
	/** Write the entry uncompressed (method 0) instead of deflated (method 8). */
	readonly stored?: boolean;
}

describe('isZipArchive', () => {
	it('recognises a ZIP by its signature, not its name', async () => {
		expect(isZipArchive(await buildZip([{ name: 'doc.kml', content: KML }]))).toBe(true);
		expect(isZipArchive(new TextEncoder().encode(KML))).toBe(false);
		expect(isZipArchive(new Uint8Array([0x50, 0x4b]))).toBe(false);
	});
});

describe('readZipEntries', () => {
	it('lists every entry from the central directory', async () => {
		const bytes = await buildZip([
			{ name: 'doc.kml', content: KML },
			{ name: 'files/overlay.png', content: 'not really a png', stored: true },
		]);

		expect(readZipEntries(bytes).map((entry) => entry.name)).toEqual([
			'doc.kml',
			'files/overlay.png',
		]);
	});

	it('refuses a file that is not an archive', () => {
		expect(() => readZipEntries(new TextEncoder().encode(KML))).toThrow(/not a readable KMZ/i);
	});
});

describe('extractKmlFromKmz', () => {
	it('reads a deflated document', async () => {
		const bytes = await buildZip([
			{ name: 'files/overlay.png', content: 'not really a png' },
			{ name: 'doc.kml', content: KML },
		]);
		expect(await extractKmlFromKmz(bytes)).toBe(KML);
	});

	it('reads a stored document', async () => {
		const bytes = await buildZip([{ name: 'doc.kml', content: KML, stored: true }]);
		expect(await extractKmlFromKmz(bytes)).toBe(KML);
	});

	it('prefers the root document over a nested one', async () => {
		const bytes = await buildZip([
			{ name: 'layers/detail.kml', content: '<kml>nested</kml>' },
			{ name: 'doc.kml', content: KML },
		]);
		expect(await extractKmlFromKmz(bytes)).toBe(KML);
	});

	it('takes a renamed root document, and a nested one when the root has none', async () => {
		expect(await extractKmlFromKmz(await buildZip([{ name: 'District.kml', content: KML }]))).toBe(
			KML,
		);
		expect(
			await extractKmlFromKmz(await buildZip([{ name: 'export/District.kml', content: KML }])),
		).toBe(KML);
	});

	it("ignores macOS's resource forks", async () => {
		const bytes = await buildZip([
			{ name: '__MACOSX/._doc.kml', content: 'resource fork' },
			{ name: 'doc.kml', content: KML },
		]);
		expect(await extractKmlFromKmz(bytes)).toBe(KML);
	});

	it('says so when the archive holds no KML', async () => {
		const bytes = await buildZip([{ name: 'files/overlay.png', content: 'not really a png' }]);
		await expect(extractKmlFromKmz(bytes)).rejects.toThrow(/holds no KML/i);
	});
});

/**
 * `readImportFileText` lives in `geometry-import.ts`, but its only decision is
 * archive-or-text, so it is tested here where the archive builder is. What it
 * hands back is asserted as text: parsing it needs `DOMParser`, which this suite
 * has no business standing up.
 */
describe('readImportFileText', () => {
	it('unpacks an archive and passes plain text straight through', async () => {
		const kmz = await buildZip([{ name: 'doc.kml', content: KML }]);
		expect(await readImportFileText(new Blob([kmz]))).toBe(KML);

		const geojson = '{"type":"Polygon","coordinates":[]}';
		expect(await readImportFileText(new Blob([geojson]))).toBe(geojson);
	});

	it('unpacks a KMZ that was handed over named .kml', async () => {
		// The name never reaches here — the bytes are what decides — which is the
		// point: agencies email these files around and the extension gets swapped.
		const kmz = await buildZip([{ name: 'doc.kml', content: KML }]);
		expect(await readImportFileText(new File([kmz], 'district.kml'))).toBe(KML);
	});
});

// ---------------------------------------------------------------------------
// A minimal ZIP writer, enough to produce archives the reader must accept.
// ---------------------------------------------------------------------------

async function buildZip(inputs: readonly ZipInput[]): Promise<Uint8Array<ArrayBuffer>> {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const input of inputs) {
		const name = encoder.encode(input.name);
		const raw = encoder.encode(input.content);
		const method = input.stored === true ? 0 : 8;
		const data = method === 0 ? raw : await deflateRaw(raw);

		const local = new Uint8Array(30 + name.length + data.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(4, 20, true); // version needed
		localView.setUint16(8, method, true);
		localView.setUint32(14, crc32(raw), true);
		localView.setUint32(18, data.length, true);
		localView.setUint32(22, raw.length, true);
		localView.setUint16(26, name.length, true);
		local.set(name, 30);
		local.set(data, 30 + name.length);
		locals.push(local);

		const central = new Uint8Array(46 + name.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, 0x02014b50, true);
		centralView.setUint16(4, 20, true); // version made by
		centralView.setUint16(6, 20, true); // version needed
		centralView.setUint16(10, method, true);
		centralView.setUint32(16, crc32(raw), true);
		centralView.setUint32(20, data.length, true);
		centralView.setUint32(24, raw.length, true);
		centralView.setUint16(28, name.length, true);
		centralView.setUint32(42, offset, true);
		central.set(name, 46);
		centrals.push(central);

		offset += local.length;
	}

	const centralSize = centrals.reduce((total, part) => total + part.length, 0);
	const eocd = new Uint8Array(22);
	const eocdView = new DataView(eocd.buffer);
	eocdView.setUint32(0, 0x06054b50, true);
	eocdView.setUint16(8, inputs.length, true);
	eocdView.setUint16(10, inputs.length, true);
	eocdView.setUint32(12, centralSize, true);
	eocdView.setUint32(16, offset, true);

	return concat([...locals, ...centrals, eocd]);
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) {
		value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
