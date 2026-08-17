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

/**
 * What this record was worked against, as a body field.
 *
 * A performed control action is done at a Habitat, against an Adult Collection,
 * or at neither — and the domain states that as one discriminated value
 * (`{ kind: 'none' | 'larval' | 'adult', … }`) rather than as three nullable
 * columns, because the kinds are exclusive and a row carrying both a habitat and
 * a collection is not a record anyone meant to write.
 *
 * The columns behind it do sync, so this is not `locationSource`'s situation of
 * having nowhere else to travel. It rides here because a column diff cannot
 * express the exclusivity: `habitat_id` moving and `collection_id` clearing are
 * two independent facts on the wire, and the server would have to guess which
 * one the caller meant. The instruction says it once, and the server derives the
 * columns from it.
 *
 * Read untyped, like the location instruction. Which kinds a command accepts is
 * the domain builder's rule, re-checked server-side over the untrusted body.
 */
function readActionContext(metadata: unknown): unknown {
	return readMutationMetadata(metadata)?.context;
}

/**
 * The context instruction as body fields, or nothing.
 *
 * Spreadable for the same reason as {@link locationSourceFields}: absent and
 * `{ kind: 'none' }` are different requests — one leaves the attachment alone,
 * the other detaches it — so a caller must be able to send neither.
 */
export function contextFields(metadata: unknown): Record<string, unknown> {
	const context = readActionContext(metadata);
	return context === undefined ? {} : { context };
}

/**
 * The refusals this write is answering, as body fields.
 *
 * Some preconditions are questions rather than rules — the mission stop is
 * already completed, the action does not cover the ground the stop names, the
 * trap code is a duplicate. The server refuses once naming the question, and
 * accepts the identical write again when it carries the flag that answers it.
 * That second attempt is the *same* command, so the answer cannot ride on the row
 * and cannot be a different intent: it is a fact about this attempt, which is
 * what `metadata` is for.
 *
 * Flat top-level keys rather than a nested object, because that is how the
 * endpoints read them — `payload.acknowledgedDuplicateTrapCode`, not
 * `payload.acknowledgements.…`. Callers group them under one metadata key so a
 * retry can merge in a new flag without touching the rest of the write; this is
 * where the grouping is undone.
 *
 * Read untyped, like `locationSource` and for the same reason. Which flags a
 * command accepts is the domain's to say and differs per command, and every one
 * of them is re-checked server-side over the untrusted body — a reader here that
 * knew the names would be a second copy of a rule it does not own. An unknown key
 * is ignored by the endpoint rather than trusted, and every flag is acted on only
 * when explicitly `true`, so passing one through costs nothing when it is wrong.
 */
export function acknowledgementFields(metadata: unknown): Record<string, unknown> {
	const acknowledgements = readMutationMetadata(metadata)?.acknowledgements;
	const flags = readMutationMetadata(acknowledgements);
	return flags === undefined ? {} : { ...flags };
}

/**
 * What a command takes that the table does not hold, as body fields.
 *
 * Not everything a command needs is a column. Cancelling a Mission takes the
 * words explaining why and an id for the comment they become; completing one
 * takes whether the server may stamp the start it was never given. None of those
 * is on `missions`, so none of them can ride on the row — and none is an
 * acknowledgement either: an acknowledgement answers a refusal and changes
 * nothing about what gets written, while these *are* what gets written.
 *
 * The comment ids are the sharper case. A lifecycle comment is a row, and a row
 * SIMMER writes carries a client-generated id so a retry cannot insert it twice.
 * The old endpoints called `randomUUID()` server-side, which is exactly how a
 * retried cancellation ends up with two comments on it.
 *
 * Flat top-level keys, like the acknowledgements, because that is how the
 * builders read them — `payload.reopenReason`. Callers group them under one
 * metadata key so the write stays one object.
 *
 * Read untyped, like every other instruction here: which arguments a command
 * takes is the domain's to say, it differs per command, and the builder re-checks
 * them server-side over an untrusted body. A reader in the transport layer that
 * knew the names would be a second copy of a rule it does not own.
 */
export function argumentFields(metadata: unknown): Record<string, unknown> {
	const values = readMutationMetadata(readMutationMetadata(metadata)?.arguments);
	return values === undefined ? {} : { ...values };
}
