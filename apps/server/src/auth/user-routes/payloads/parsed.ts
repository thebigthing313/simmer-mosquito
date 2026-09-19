export type Parsed<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string };

/** The one thing a payload reader needs of a request. */
export interface JsonRequest {
	readonly json: () => Promise<unknown>;
}
