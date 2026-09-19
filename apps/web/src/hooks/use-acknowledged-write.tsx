import { type ReactNode, useState } from 'react';
import { AcknowledgementDialog } from '../components/acknowledgement-dialog';
import { STOP_ACKNOWLEDGEABLE_REFUSALS } from '../lib/acknowledgement-copy';
import { acknowledgeableRefusalOf, consequencesOf } from '../lib/acknowledgements';
import type { DeleteImpactEntry } from './use-delete-impact';

/**
 * The flags to send with a write, keyed exactly as the endpoint reads them.
 *
 * `false` is a real answer, not an absence: `acknowledged()` on the server reads
 * a missing flag as confirmed, so a `false` is the only thing that makes a guard
 * fire at all.
 */
export type Acknowledgements = Readonly<Record<string, boolean>>;

/** `run`, as a component takes it from `useAcknowledgedWrite`. */
export type AskAcknowledged = (
	write: (acknowledgements: Acknowledgements) => Promise<void>,
) => Promise<void>;

/**
 * A write that may be refused with a question, and the question.
 *
 * `run` sends the write; a refusal naming a flag in `askable` becomes the
 * `dialog`, and confirming it sends the write again with that flag `true`.
 * With `ask: true` the first attempt sends every askable flag as `false`;
 * without it the first attempt sends no flags. A refusal no flag can answer is
 * rethrown.
 */
export function useAcknowledgedWrite(
	options: {
		/** The questions this surface may be asked, from `lib/acknowledgement-copy.ts`. */
		readonly askable?: Readonly<Record<string, string>>;
		/** Send every askable flag as `false` on the first attempt. */
		readonly ask?: boolean;
	} = {},
): {
	/**
	 * Run a write. `acknowledgements` holds what has been answered so far.
	 *
	 * **Resolving does not mean the write succeeded.** A refusal that a flag can
	 * answer is a question, not a failure, so it is swallowed here and turned into
	 * the dialog, and `run` resolves normally. Anything that should happen only
	 * once the write lands, a navigation most of all, belongs *inside* `write`
	 * rather than after this call; put it after and the page leaves before the
	 * question can be asked, which reads as a save that worked. Only a refusal no
	 * flag can answer is rethrown.
	 */
	readonly run: (write: (acknowledgements: Acknowledgements) => Promise<void>) => Promise<void>;
	/** Render inside the page. Null until a write is refused with a question. */
	readonly dialog: ReactNode;
} {
	const askable = options.askable ?? STOP_ACKNOWLEDGEABLE_REFUSALS;
	const ask = options.ask ?? false;
	const [pending, setPending] = useState<{
		readonly write: (acknowledgements: Acknowledgements) => Promise<void>;
		readonly acknowledgements: Acknowledgements;
		readonly flag: string;
		readonly consequences: readonly DeleteImpactEntry[];
	} | null>(null);

	const attempt = async (
		write: (acknowledgements: Acknowledgements) => Promise<void>,
		acknowledgements: Acknowledgements,
	) => {
		try {
			await write(acknowledgements);
			setPending(null);
		} catch (error) {
			const flag = acknowledgeableRefusalOf(error, askable);
			if (flag === null) {
				// Not a question. Hand it back to whatever the caller does with a
				// failed save.
				throw error;
			}
			setPending({
				acknowledgements,
				consequences: consequencesOf(error),
				flag,
				write,
			});
		}
	};

	const run = (write: (acknowledgements: Acknowledgements) => Promise<void>) =>
		attempt(write, ask ? withheld(askable) : {});

	const dialog =
		pending === null ? null : (
			<AcknowledgementDialog
				consequences={pending.consequences}
				flag={pending.flag}
				onCancel={() => setPending(null)}
				onConfirm={() => {
					void attempt(pending.write, { ...pending.acknowledgements, [pending.flag]: true });
				}}
			/>
		);

	return { dialog, run };
}

/** Every askable flag, unanswered. */
function withheld(askable: Readonly<Record<string, string>>): Acknowledgements {
	const flags: Record<string, boolean> = {};
	for (const flag of Object.values(askable)) {
		flags[flag] = false;
	}
	return flags;
}
