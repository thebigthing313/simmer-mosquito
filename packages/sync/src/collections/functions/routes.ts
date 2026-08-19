/**
 * The two routes a table has, derived from its name.
 *
 * Both were free text before — an `endpointPath` on the descriptor, guarded by a
 * `startsWith` throw, which is what you write when two places choose a string and
 * have to agree. Deriving them means there is one choice.
 *
 * They live in their own module because both the collection and the request
 * builder need them, and the request builder cannot import the collection: the
 * collection already imports the handlers, which import the request builder.
 *
 * The server registering these routes should call these functions rather than
 * restate the convention. That is the reason they are exported from a package
 * both sides can import.
 */

/** Where a table's Electric shape is served. */
export function shapePathFor(table: string): string {
	return `/sync/shapes/${table}`;
}

/**
 * Where a table's commands are posted.
 *
 * Nothing domain-scoped remains in the path. A write names the command it means,
 * so the route only has to say which table it is about.
 */
export function commandPathFor(table: string): string {
	return `/commands/${table}`;
}
