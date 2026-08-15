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
 * The command this write means. Required.
 *
 * Without it a server has only the payload to go on and must infer the intent
 * from which fields are present — `is_active: false` must mean "retire", because
 * nothing else could have said so. That inference is what makes a payload's shape
 * load-bearing: an extra key becomes an extra command, and the endpoint has to
 * grant its own acknowledgements because it cannot tell a deliberate retirement
 * from an incidental one.
 *
 * Naming the command removes the guess, which is what lets the client send a
 * payload without curating it. That trade only holds if the name is always there,
 * so this throws rather than returning `undefined`: an unnamed write is a
 * malformed request, not a request with a missing option.
 *
 * Refusing here is not domain validation — whether the named command is real,
 * permitted, and applicable is decided by the server. This only checks that the
 * request says what it is.
 *
 * Typed as a plain string rather than the domain's command union: `packages/sync`
 * does not depend on `packages/domain`, and the server re-derives the command
 * from this name anyway, so a wrong one is refused rather than trusted.
 */
export function requireIntent(metadata: unknown, table: string): string {
	const intent = readMutationMetadata(metadata)?.intent;

	if (typeof intent !== 'string' || intent.length === 0) {
		throw new Error(`A write to ${table} must name the command it means, as \`metadata.intent\`.`);
	}

	return intent;
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
