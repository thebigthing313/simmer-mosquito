import {
	type ImportBaseGeometryKind,
	type ImportGeometry,
	type ImportGeometryKind,
	type ImportNote,
	importBaseGeometryKind,
	importPartCount,
	importVertexCount,
} from '@simmer-mosquito/mapping';

/**
 * What an import surface calls one of the shapes it is offering, and what it
 * says about the shapes it is not.
 *
 * Both surfaces say the same things in the same words. A refusal is a note
 * rather than a row state on purpose: the user picked a parks file because of
 * Park A, and a preview that leaves Park A out without a word is the failure
 * ADR 0018 exists to delete.
 */
export interface ImportNoun {
	readonly one: string;
	readonly many: string;
}

const GEOMETRY: ImportNoun = { one: 'geometry', many: 'geometries' };

/**
 * The word for each single-piece kind, keyed by the kind so the compiler asks
 * for one per kind rather than letting a new kind fall through to the general
 * word.
 */
const BASE_NOUN = {
	Point: { one: 'point', many: 'points' },
	LineString: { one: 'line', many: 'lines' },
	Polygon: { one: 'polygon', many: 'polygons' },
} as const satisfies Readonly<Record<ImportBaseGeometryKind, ImportNoun>>;

/**
 * The word for one shape a record of these types can store.
 *
 * The specific one wherever the record stores a single kind of thing, so a
 * Region import still reads "Import a Polygon" and a Trap reads "Import a
 * Point". Where a record takes areas and lines alike there is no specific word,
 * and the general one is Geometry: it is what `GeometryControl` is already
 * labelled and what the register's own names say. "Shape" would be a second name
 * for something already named once.
 */
export function importNoun(allowedTypes: readonly ImportGeometryKind[]): ImportNoun {
	const bases = new Set(allowedTypes.map(importBaseGeometryKind));
	const [only] = bases;
	return bases.size === 1 && only !== undefined ? BASE_NOUN[only] : GEOMETRY;
}

/** The noun as a title reads it: "Import a Polygon", "Use This Geometry". */
export function importNounTitle(noun: ImportNoun): string {
	return `${noun.one.slice(0, 1).toUpperCase()}${noun.one.slice(1)}`;
}

/**
 * What a row says about what reading its feature dropped, keyed by the note so
 * the compiler asks for a sentence per note rather than letting a new one pass
 * unsaid.
 */
const NOTE_TEXT = {
	labelPoint: 'label point dropped',
} as const satisfies Readonly<Record<ImportNote, string>>;

/**
 * The line under an import row's name: its pieces where it has several, its
 * vertices, and anything the reading dropped.
 *
 * Both surfaces show it and both say the same things, so it is written once. The
 * piece count earns its place because it names what changed: a file that used to
 * produce three rows now produces one, and the count is what says those three
 * lots are still there rather than dissolved. A point has one vertex, and "1
 * vertices" is the sort of thing a user reads as a bug in the file.
 */
export function importRowSummary(geometry: ImportGeometry, note: ImportNote | null): string {
	const parts = importPartCount(geometry);
	const count = importVertexCount(geometry);
	return [
		parts > 1 ? `${parts} pieces` : null,
		`${count} ${count === 1 ? 'vertex' : 'vertices'}`,
		note === null ? null : NOTE_TEXT[note],
	]
		.filter((piece) => piece !== null)
		.join(' · ');
}

export interface ImportRefusalCounts {
	/** Shapes whose coordinates are not WGS84 lng/lat. */
	readonly projected: number;
	/** Features whose pieces this record cannot store. */
	readonly multipart: number;
	/** Features holding geometry of more than one kind. */
	readonly mixed: number;
}

/** Nothing renders at zero, so a clean file shows no chrome at all. */
export function ImportNotes({
	counts,
	noun,
}: {
	readonly counts: ImportRefusalCounts;
	readonly noun: ImportNoun;
}) {
	const { projected, multipart, mixed } = counts;
	if (projected === 0 && multipart === 0 && mixed === 0) {
		return null;
	}

	return (
		<div className="grid gap-1">
			{projected === 0 ? null : (
				<Note>
					{projected} {projected === 1 ? 'shape uses' : 'shapes use'} coordinates outside the
					longitude/latitude range. Re-export the file as WGS84 (EPSG:4326) to use{' '}
					{projected === 1 ? 'it' : 'them'}.
				</Note>
			)}
			{multipart === 0 ? null : (
				<Note>
					{multipart} {multipart === 1 ? `${noun.one} has` : `${noun.many} have`} separate pieces
					and cannot be used here.
				</Note>
			)}
			{mixed === 0 ? null : (
				<Note>
					{mixed} {mixed === 1 ? 'feature holds' : 'features hold'} mixed geometry and{' '}
					{mixed === 1 ? 'was' : 'were'} skipped.
				</Note>
			)}
		</div>
	);
}

function Note({ children }: { readonly children: React.ReactNode }) {
	return <p className="m-0 text-muted-foreground text-xs">{children}</p>;
}
