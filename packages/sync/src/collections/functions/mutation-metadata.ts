/**
 * Reading the side-channel a write carries alongside its row.
 *
 * `insert()`, `update()` and `delete()` each take a `metadata` record, and it is
 * where everything a row cannot express travels: the geometry a shape was drawn
 * from, the acknowledgements a refusal asked for, and the name of the command the
 * caller meant to issue.
 */

export function readMutationMetadata(metadata: unknown): Record<string, unknown> | undefined {
	if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
		return undefined;
	}
	return metadata as Record<string, unknown>;
}

/**
 * The command a write means, when the caller named one.
 *
 * Without it a server has only the payload to go on, and has to infer the intent
 * from which fields are present — `is_active: false` must mean "retire", because
 * nothing else could have said so. That inference is why the endpoints currently
 * grant their own acknowledgements: they cannot tell a deliberate retirement from
 * an incidental one, so they assume the caller meant it.
 *
 * Naming the command removes the guess. It is optional on purpose — a payload
 * without an intent is exactly what the endpoints already accept — so call sites
 * can adopt it one at a time.
 *
 * Typed as a plain string rather than the domain's command union: `packages/sync`
 * does not depend on `packages/domain`, and the server re-derives the command
 * from this name anyway, so a wrong one is refused rather than trusted.
 */
export function readIntent(metadata: unknown): string | undefined {
	const record = readMutationMetadata(metadata);
	const intent = record?.intent;
	return typeof intent === 'string' && intent.length > 0 ? intent : undefined;
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
export function readLocationSource(metadata: unknown): unknown {
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
