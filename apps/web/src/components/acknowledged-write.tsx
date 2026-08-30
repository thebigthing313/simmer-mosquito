import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { type ReactNode, useCallback, useState } from 'react';
import type { DeleteImpactEntry } from '../hooks/use-delete-impact';
import { impactCountLabel } from '../hooks/use-delete-impact';
import { acknowledgementCopyFor, STOP_ACKNOWLEDGEABLE_REFUSALS } from '../lib/acknowledgement-copy';
import { acknowledgeableRefusalOf, consequencesOf } from '../lib/acknowledgements';

/**
 * The flags to send with a write, keyed exactly as the endpoint reads them.
 *
 * `false` is a real answer, not an absence: `acknowledged()` on the server reads
 * a missing flag as confirmed, so a `false` is the only thing that makes a guard
 * fire at all.
 */
export type Acknowledgements = Readonly<Record<string, boolean>>;

/**
 * A write that may be refused with a question, and the question.
 *
 * An acknowledgeable refusal is a condition the server can only discover once it
 * has the rows in front of it: how many inspections a habitat delete would
 * unlink, how many summaries a station rename would relabel. Asking up front
 * would put a checkbox on every form for a case that usually does not arise, so
 * the write goes out with the flags withheld and the refusal is what raises the
 * question.
 *
 * ## `ask` is the opt-in, and it is the whole issue
 *
 * With `ask: false`, the default, the first attempt sends no flags and the
 * server treats every one of them as already confirmed. That is what every
 * surface did before #319 and what mobile and any script still do, which is why
 * flipping `acknowledged()` was rejected. A surface opts in with `ask: true`,
 * which seeds every flag in `askable` as `false` so the guards actually run, and
 * owes a test asserting its first attempt does so. Without that test the form
 * passes every guard silently.
 *
 * ## Why the askable map is an argument
 *
 * A refusal names its flag, and a page must only offer answers to questions it
 * can pose. Sharing one map across surfaces would offer a technician a "delete
 * the summaries" answer to a question about a mission stop, which the endpoint
 * would ignore, and the dialog would still have asked. The maps live in
 * `lib/acknowledgement-copy.ts` beside the words.
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

	const attempt = useCallback(
		async (
			write: (acknowledgements: Acknowledgements) => Promise<void>,
			acknowledgements: Acknowledgements,
		) => {
			try {
				await write(acknowledgements);
				setPending(null);
			} catch (error) {
				const flag = acknowledgeableRefusalOf(error, askable);
				if (flag === null) {
					// Not a question — hand it back to whatever the caller does with a
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
		},
		[askable],
	);

	const run = useCallback(
		(write: (acknowledgements: Acknowledgements) => Promise<void>) =>
			attempt(write, ask ? withheld(askable) : {}),
		[ask, askable, attempt],
	);

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

/**
 * One question, from the flag the server named and the counts it sent.
 *
 * The server's own `message` is deliberately not shown: it is written for a
 * developer reading a response body. The words come from
 * `ACKNOWLEDGEMENT_COPY`, and a flag with no entry gets a sentence built from
 * the counts rather than a dead end.
 */
function AcknowledgementDialog({
	flag,
	consequences,
	onCancel,
	onConfirm,
}: {
	readonly flag: string;
	readonly consequences: readonly DeleteImpactEntry[];
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
}) {
	const copy = acknowledgementCopyFor(flag, consequences);
	return (
		<Dialog onOpenChange={(next) => (next ? undefined : onCancel())} open>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
					<DialogDescription>{copy.body}</DialogDescription>
				</DialogHeader>
				{consequences.length === 0 ? null : (
					<ul className="m-0 grid list-none gap-0.5 p-0 text-foreground text-sm">
						{consequences.map((entry) => (
							<li key={entry.key}>{impactCountLabel(entry)}</li>
						))}
					</ul>
				)}
				<DialogFooter>
					<Button onClick={onCancel} type="button" variant="ghost">
						Back
					</Button>
					<Button onClick={onConfirm} type="button">
						{copy.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
