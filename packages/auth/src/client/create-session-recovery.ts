import type { AppAuthController } from './app-auth-controller.js';

/**
 * Turn a refused request into a renewed session or a sign-out. Answers whether
 * the caller should retry. `onSessionLost` fires once per loss however many
 * collections were refused in the same tick, and only a loss that was acted on
 * latches; a session that comes back re-arms it. A broken round trip is not a
 * refusal and answers `true`.
 */
export function createSessionRecovery(options: {
	readonly controller: AppAuthController;
	/** Send the reader to sign in. `false` when there was nowhere to send them. */
	readonly onSessionLost: () => boolean;
}): () => Promise<boolean> {
	let reported = false;

	return async () => {
		const answer = await options.controller.renew();
		if (answer.authenticated === true) {
			reported = false;
			return true;
		}

		if (!reported) {
			reported = options.onSessionLost();
		}

		return false;
	};
}
