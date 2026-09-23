/**
 * Where a client with no cookie jar keeps its sealed session. The web apps pass
 * none; `apps/mobile` backs one with the device keystore (ADR 0016).
 */
export interface SessionTransport {
	readonly read: () => Promise<string | null>;
	readonly write: (sealedSession: string) => Promise<void>;
	readonly clear: () => Promise<void>;
}
