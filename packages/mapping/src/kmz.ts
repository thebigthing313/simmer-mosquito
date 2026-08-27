/**
 * Reading the KML document out of a KMZ archive.
 *
 * A KMZ is an ordinary ZIP holding one KML document plus whatever that document
 * references — icons, overlay imagery, models. Google Earth and ArcGIS both save
 * KMZ by default, so an importer that accepts only `.kml` sends people back to
 * re-export a file they already have.
 *
 * This stays dependency-free like the rest of the package: the central directory
 * is walked by hand, and the one compression method ZIP actually uses is inflated
 * by the platform's own `DecompressionStream('deflate-raw')`. Only the KML entry
 * is decompressed; the archive's imagery is located and then left alone.
 *
 * Nothing here validates CRCs. The file was chosen by the person importing it and
 * never leaves the device, and the KML parser downstream rejects anything that
 * inflates to nonsense.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

/** An end-of-central-directory record with no archive comment. */
const EOCD_LENGTH = 22;
/** Fixed part of a central directory file header, before the name. */
const CENTRAL_FILE_LENGTH = 46;
/** Fixed part of a local file header, before the name. */
const LOCAL_FILE_LENGTH = 30;

/** The two counts/offsets ZIP64 replaces with an all-ones sentinel. */
const ZIP64_COUNT = 0xffff;
const ZIP64_OFFSET = 0xffffffff;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/**
 * The bytes of an archive, or of one entry in it.
 *
 * The `ArrayBuffer` type argument is not decoration. `Blob` is how the inflate
 * step feeds `DecompressionStream`, and it rejects a view that might sit on a
 * `SharedArrayBuffer` — which is what a bare `Uint8Array` now means. Naming the
 * buffer here keeps that constraint at the entry points instead of at the one
 * line that trips over it.
 */
export type ArchiveBytes = Uint8Array<ArrayBuffer>;

/** One file in the archive, as the central directory describes it. */
export interface ZipEntry {
	readonly name: string;
	/** ZIP compression method: 0 stored, 8 deflate, anything else unsupported. */
	readonly method: number;
	readonly compressedSize: number;
	readonly localHeaderOffset: number;
	readonly encrypted: boolean;
}

/**
 * True when these bytes open with a ZIP local-file (`PK\x03\x04`) or
 * empty-archive (`PK\x05\x06`) signature. Those two whole signatures, not any
 * mix of their halves — `PK\x03\x06` is not a thing, and treating it as an
 * archive would trade a readable KML complaint for a confusing archive one.
 */
export function isZipArchive(bytes: ArchiveBytes): boolean {
	if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
		return false;
	}
	return (bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06);
}

/**
 * Read the archive's central directory. This is the authoritative index — local
 * headers may leave the sizes zeroed when the writer streamed the entry and put
 * them in a trailing data descriptor, so sizes are only ever taken from here.
 */
export function readZipEntries(bytes: ArchiveBytes): ZipEntry[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEndOfCentralDirectory(view);
	if (eocd === null) {
		throw new Error('That file is not a readable KMZ archive.');
	}

	const count = view.getUint16(eocd + 10, true);
	let offset = view.getUint32(eocd + 16, true);
	if (count === ZIP64_COUNT || offset === ZIP64_OFFSET) {
		throw new Error('That KMZ is in the ZIP64 format, which this importer cannot read.');
	}

	const entries: ZipEntry[] = [];
	for (let index = 0; index < count; index += 1) {
		if (
			offset + CENTRAL_FILE_LENGTH > view.byteLength ||
			view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE
		) {
			throw new Error("That KMZ's file listing is damaged.");
		}
		const flags = view.getUint16(offset + 8, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const nameStart = offset + CENTRAL_FILE_LENGTH;
		entries.push({
			name: decodeEntryName(bytes.subarray(nameStart, nameStart + nameLength)),
			method: view.getUint16(offset + 10, true),
			compressedSize: view.getUint32(offset + 20, true),
			localHeaderOffset: view.getUint32(offset + 42, true),
			// Bit 0 of the general purpose flags.
			encrypted: (flags & 1) !== 0,
		});
		offset = nameStart + nameLength + extraLength + commentLength;
	}
	return entries;
}

/** Decompress one entry's bytes. */
async function readZipEntryBytes(bytes: ArchiveBytes, entry: ZipEntry): Promise<ArchiveBytes> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const header = entry.localHeaderOffset;
	if (
		header + LOCAL_FILE_LENGTH > view.byteLength ||
		view.getUint32(header, true) !== LOCAL_FILE_SIGNATURE
	) {
		throw new Error("That KMZ's file listing is damaged.");
	}
	// The local header carries its own name/extra lengths, which need not match the
	// central directory's — extra fields are routinely written to only one of them.
	const nameLength = view.getUint16(header + 26, true);
	const extraLength = view.getUint16(header + 28, true);
	const start = header + LOCAL_FILE_LENGTH + nameLength + extraLength;
	const end = start + entry.compressedSize;
	if (end > bytes.length) {
		throw new Error('That KMZ is truncated.');
	}

	const data = bytes.subarray(start, end);
	if (entry.method === METHOD_STORED) {
		return data;
	}
	if (entry.method !== METHOD_DEFLATE) {
		throw new Error(`That KMZ uses an unsupported compression method (${entry.method}).`);
	}
	return inflateRaw(data);
}

/**
 * Pull the KML document out of a KMZ, as text ready for the KML parser.
 *
 * Throws with a message a caller can render; every failure here is a property of
 * the file the user picked, so the message names it.
 */
export async function extractKmlFromKmz(bytes: ArchiveBytes): Promise<string> {
	const entry = pickKmlEntry(readZipEntries(bytes));
	if (entry === null) {
		throw new Error('That KMZ holds no KML document.');
	}
	if (entry.encrypted) {
		throw new Error('That KMZ is password-protected.');
	}
	return new TextDecoder().decode(await readZipEntryBytes(bytes, entry));
}

/**
 * Which entry is *the* document.
 *
 * A KMZ is meant to carry exactly one KML at the archive root, and the tools that
 * write them name it `doc.kml`. Real files drift: the root document gets renamed,
 * a hand-zipped export nests everything one folder deep, and an archive made on
 * macOS carries a `__MACOSX/` shadow of every entry. So the root document wins, a
 * nested one is the fallback, and resource forks are never considered.
 */
function pickKmlEntry(entries: readonly ZipEntry[]): ZipEntry | null {
	const documents = entries.filter((entry) => /\.kml$/i.test(entry.name) && !isArchiveJunk(entry));
	const root = documents.filter((entry) => !entry.name.includes('/'));
	return (
		root.find((entry) => entry.name.toLowerCase() === 'doc.kml') ?? root[0] ?? documents[0] ?? null
	);
}

function isArchiveJunk(entry: ZipEntry): boolean {
	const base = entry.name.split('/').at(-1) ?? '';
	return entry.name.startsWith('__MACOSX/') || base.startsWith('.');
}

/**
 * Find the end-of-central-directory record, scanning back from the end over the
 * archive comment. The signature can also occur inside that comment, so a
 * candidate only counts when its declared comment length reaches exactly the end
 * of the file.
 */
function findEndOfCentralDirectory(view: DataView): number | null {
	const earliest = Math.max(0, view.byteLength - EOCD_LENGTH - 0xffff);
	for (let offset = view.byteLength - EOCD_LENGTH; offset >= earliest; offset -= 1) {
		if (
			view.getUint32(offset, true) === EOCD_SIGNATURE &&
			view.getUint16(offset + 20, true) === view.byteLength - offset - EOCD_LENGTH
		) {
			return offset;
		}
	}
	return null;
}

/**
 * Entry names are UTF-8 when the writer sets the language encoding flag and CP437
 * otherwise. Decoding everything as UTF-8 mangles nothing in practice — the names
 * are only read to find the `.kml`, and the archives that reach here name it in
 * ASCII, where the two encodings agree.
 */
function decodeEntryName(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

/**
 * Inflate one entry.
 *
 * Everything the platform can throw here is translated, because the callers
 * render the message: a bad deflate stream rejects with the engine's own
 * `TypeError`, and an engine that has `DecompressionStream` but not the
 * `deflate-raw` format throws from the constructor rather than being absent — so
 * the `typeof` guard alone would let both reach a user as engine vocabulary.
 */
async function inflateRaw(data: ArchiveBytes): Promise<ArchiveBytes> {
	if (typeof DecompressionStream === 'undefined') {
		throw new Error('Reading a KMZ is only available in the browser.');
	}
	try {
		const inflated = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		return new Uint8Array(await new Response(inflated).arrayBuffer());
	} catch {
		throw new Error("That KMZ's KML document could not be decompressed.");
	}
}
