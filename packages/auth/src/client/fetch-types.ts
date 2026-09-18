/**
 * Derived from `fetch` rather than written as `RequestInit` and `Response`,
 * because this package compiles without `lib.dom` and is consumed by React
 * Native, whose `fetch` types come from a third place.
 */
export type FetchInput = Parameters<typeof fetch>[0];
export type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
export type FetchResponse = Awaited<ReturnType<typeof fetch>>;

export type AuthFetch = (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;
