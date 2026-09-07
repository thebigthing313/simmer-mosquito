import {
	type BaseGeometryType,
	getOwnedGeometryBaseTypes,
	type OwnedGeometryKind,
} from '@simmer-mosquito/domain';

/**
 * The sentence under a Location heading, composed rather than written out.
 *
 * Five forms spelled the same three sentences with different nouns in them:
 * what the geometry is, which shape to draw, and that the address is reference
 * rather than the location. Only the first is a fact about the record, so it is
 * the only one a caller passes. The other two are facts about the section, and
 * the second is a fact about the register: which shapes a record may store is
 * `OWNED_GEOMETRY_POLICIES` in `packages/domain`, and the sentence telling a
 * user to draw a line is wrong on a Trap, which stores a point and nothing else.
 * Reading the register is what keeps the copy and the toggle saying one thing.
 *
 * The three control-operations forms each said the habitat clause their own way
 * ("performed against", "applied to", "done at"). One wording covers all three,
 * so `habitat` is a flag rather than a string.
 */
export function locationDescription({
	geometryKind,
	subject,
	habitat = false,
}: {
	readonly geometryKind: OwnedGeometryKind;
	/** What the geometry is on this record, as a whole sentence ending in a full stop. */
	readonly subject: string;
	/** Whether the section also carries a habitat picker. */
	readonly habitat?: boolean;
}): string {
	const address = habitat
		? 'An address is optional reference, and the habitat is the one the work was done at.'
		: 'An address is optional reference.';
	return `${subject} ${shapeGuidance(geometryKind)} ${address}`;
}

/**
 * How a shape is named on screen, keyed by the shape the draw control offers.
 *
 * "Area" rather than "polygon", which is the word the toggle and the import
 * preview use. Keyed by the union so the compiler holds it to the three base
 * shapes; a hand-written list of names here is what `check:geometry-policies`
 * refuses, and rightly.
 */
const SHAPE_PHRASES: Readonly<Record<BaseGeometryType, string>> = {
	Point: 'a point',
	LineString: 'a line',
	Polygon: 'an area',
};

/** Which shape to draw, off what the record may store. */
function shapeGuidance(kind: OwnedGeometryKind): string {
	const shapes = getOwnedGeometryBaseTypes(kind);
	const spread = shapes
		.filter((shape) => shape !== 'Point')
		.map((shape) => SHAPE_PHRASES[shape])
		.join(' or ');
	if (spread === '') {
		return 'Place a point.';
	}
	if (!shapes.includes('Point')) {
		return `Draw ${spread}.`;
	}
	return `Use a point for a single spot, ${spread} for a stretch.`;
}
