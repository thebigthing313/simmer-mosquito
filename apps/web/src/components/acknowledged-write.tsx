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
import {
	acknowledgeableRefusalOf,
	STOP_ACKNOWLEDGEABLE_REFUSALS,
} from '../lib/stop-acknowledgements';
import { messageFromBody } from '../sync/command-error';

/** The flags to send with a write, keyed exactly as the endpoint reads them. */
export type Acknowledgements = Readonly<Record<string, true>>;

/** What a refusal-driven question is called on screen. */
export interface AcknowledgementLabels {
	readonly title: string;
	readonly confirm: string;
	/** Shown when the server's body carried no `reason` of its own. */
	readonly fallbackReason: string;
}

const STOP_LABELS: AcknowledgementLabels = {
	title: 'Record this anyway?',
	confirm: 'Record it',
	fallbackReason: 'This record does not match the stop it was recorded from.',
};

/**
 * A write that may be refused with a question, and the question.
 *
 * An acknowledgeable refusal is a condition the server can only discover once it
 * has the row in front of it — whether the stop was already completed, whether
 * the station already has summaries a rename would relabel. Asking up front
 * would put a checkbox on every form for a case that almost never arises, so the
 * write goes out plain and the refusal is what raises the question.
 *
 * The wording is the server's `reason`. It already has to be right, because a
 * refusal with no way past it surfaces the same sentence.
 *
 * ## Why the refusal map is an argument
 *
 * Two families of write use this, and they are refused over different things.
 * The stop executions have five refusals about assignment and mission items; the
 * weather station writes have three about a station's history. Sharing one map
 * would offer a technician a "delete the summaries" answer to a question about a
 * mission stop — which the endpoint would ignore, and the dialog would still
 * have asked. So each caller brings the refusals it can be asked and the words
 * to ask them in, and only the retry machinery is shared.
 */
export function useAcknowledgedWrite(
	refusals: Readonly<Record<string, string>> = STOP_ACKNOWLEDGEABLE_REFUSALS,
	labels: AcknowledgementLabels = STOP_LABELS,
): {
	/** Run a write; `acknowledgements` is empty on the first attempt. */
	readonly run: (write: (acknowledgements: Acknowledgements) => Promise<void>) => Promise<void>;
	/** Render inside the page. Null until a write is refused with a question. */
	readonly dialog: ReactNode;
} {
	const [pending, setPending] = useState<{
		readonly write: (acknowledgements: Acknowledgements) => Promise<void>;
		readonly acknowledgements: Acknowledgements;
		readonly flag: string;
		readonly reason: string;
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
				const flag = acknowledgeableRefusalOf(error, refusals);
				if (flag === null) {
					// Not a question — hand it back to whatever the caller does with a
					// failed save.
					throw error;
				}
				setPending({
					acknowledgements,
					reason: messageFromBody(
						(error as { readonly body?: unknown }).body,
						labels.fallbackReason,
					),
					flag,
					write,
				});
			}
		},
		[refusals, labels.fallbackReason],
	);

	const run = useCallback(
		(write: (acknowledgements: Acknowledgements) => Promise<void>) => attempt(write, {}),
		[attempt],
	);

	const dialog =
		pending === null ? null : (
			<Dialog onOpenChange={(next) => (next ? undefined : setPending(null))} open>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{labels.title}</DialogTitle>
						<DialogDescription>{pending.reason}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setPending(null)} type="button" variant="ghost">
							Back
						</Button>
						<Button
							onClick={() => {
								void attempt(pending.write, {
									...pending.acknowledgements,
									[pending.flag]: true,
								});
							}}
							type="button"
						>
							{labels.confirm}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);

	return { dialog, run };
}
