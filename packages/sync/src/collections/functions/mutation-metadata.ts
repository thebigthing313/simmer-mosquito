/**
 * Reading the side-channel a write carries alongside its row.
 *
 * `insert()`, `update()` and `delete()` each take a `metadata` record, and it is
 * where everything a row cannot express travels: the geometry a shape was drawn
 * from, the acknowledgements a refusal asked for, and the name of the command the
 * caller meant to issue.
 */

function readMutationMetadata(metadata: unknown): Record<string, unknown> | undefined {
	if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
		return undefined;
	}
	return metadata as Record<string, unknown>;
}

/**
 * The commands this write means. At least one, required.
 *
 * Without them a server has only the payload to go on and must infer the intent
 * from which fields are present — `is_active: false` must mean "retire", because
 * nothing else could have said so. That inference is what makes a payload's shape
 * load-bearing: an extra key becomes an extra command, and the endpoint has to
 * grant its own acknowledgements because it cannot tell a deliberate retirement
 * from an incidental one.
 *
 * Naming the commands removes the guess, which is what lets the client send a
 * payload without curating it. That trade only holds if the names are always
 * there, so this throws rather than returning `undefined`: an unnamed write is a
 * malformed request, not a request with a missing option.
 *
 * ## Why a list rather than one name
 *
 * One save can mean more than one command against the same row. Renaming a
 * Habitat and redrawing its geometry is `updateHabitatDetails` and
 * `updateHabitatLocation` — two commands, one row, one save.
 *
 * Sending them as two writes does not work, and fails quietly. TanStack DB merges
 * two updates to one key into a single mutation: the changed fields union, but
 * `metadata` is replaced whole, last write wins. The request would carry both the
 * new name and the new geometry under the name of the second command alone, the
 * server would run one builder that does not read the other's fields, and the
 * rename would vanish behind a 200.
 *
 * A list has no such seam. The server runs each named builder over the same body
 * and commits the resulting commands in one transaction, which is what its write
 * loop already takes.
 *
 * Typed as plain strings rather than the domain's command union: `packages/sync`
 * does not depend on `packages/domain`, and the server re-derives each command
 * from its name anyway, so a wrong one is refused rather than trusted.
 */
export function requireIntents(metadata: unknown, table: string): readonly string[] {
	const intents = readMutationMetadata(metadata)?.intents;

	if (
		!Array.isArray(intents) ||
		intents.length === 0 ||
		!intents.every((intent) => typeof intent === 'string' && intent.length > 0)
	) {
		throw new Error(
			`A write to ${table} must name the commands it means, as a non-empty \`metadata.intents\`.`,
		);
	}

	return intents;
}

/**
 * Where the server should take this record's geometry from.
 *
 * Not a geometry value — an instruction. `{ kind: 'geometry', geometry }` carries
 * a shape the user drew, and the other kinds (`address`, `habitat`, `trap`, …)
 * name a row to copy one from. The client cannot send the shape in those cases
 * because `geom` never syncs, and it should not: an id can be checked against the
 * caller's organization before it is dereferenced, and geometry cannot.
 *
 * Read untyped here on purpose. Which kinds a command accepts differs per command
 * — a trap takes a drawn point or an address, a habitat takes more — and the
 * domain builder re-checks that server-side over the untrusted body. A reader in
 * the transport layer that knew those unions would be a second copy of a rule it
 * does not own.
 */
function readLocationSource(metadata: unknown): unknown {
	return readMutationMetadata(metadata)?.locationSource;
}

/**
 * The location instruction as body fields, or nothing.
 *
 * Kept as a spreadable record rather than a value so a caller can fold it into a
 * payload without deciding whether the key should be present at all.
 */
export function locationSourceFields(metadata: unknown): Record<string, unknown> {
	const locationSource = readLocationSource(metadata);
	return locationSource === undefined ? {} : { locationSource };
}
