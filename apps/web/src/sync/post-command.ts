import { getServerUrl } from '../auth';

/**
 * Posting a command that no collection mutation can express.
 *
 * Most writes ride an optimistic collection mutation, but reordering and other
 * compound commands (create-from-route, for one) touch several rows in a single
 * server transaction. Those go straight to their command endpoint.
 *
 * A command endpoint answers with a `txid` on success. Its absence means the write
 * did not commit even when the status looks fine, so it is treated as a failure
 * rather than trusted — the same contract `createRecordHandlers` enforces for
 * collection writes.
 */
export async function postCommand(
	path: string,
	body: Record<string, unknown>,
	fallbackError: string,
): Promise<void> {
	const response = await fetch(new URL(path, getServerUrl()), {
		method: 'POST',
		credentials: 'include',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const result = (await response.json().catch(() => ({}))) as {
		readonly txid?: number;
		readonly reason?: string;
		readonly message?: string;
	};
	if (!response.ok || result.txid === undefined) {
		throw new Error(result.reason ?? result.message ?? fallbackError);
	}
}
