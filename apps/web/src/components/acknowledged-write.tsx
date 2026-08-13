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
	type AcknowledgeableRefusal,
	acknowledgeableRefusalOf,
	type StopAcknowledgements,
	withAcknowledgement,
} from '../lib/stop-acknowledgements';
import { messageFromBody } from '../sync/command-error';

/**
 * A write that may be refused with a question, and the question.
 *
 * The four acknowledgeable refusals are conditions the server can only discover
 * once it has the row in front of it — whether the stop was already completed,
 * whether the geometry covers. Asking up front would put four checkboxes on
 * every form for cases that almost never arise, so the write goes out plain,
 * and the refusal is what raises the question.
 *
 * The wording is the server's `reason`. It already has to be right, because a
 * refusal with no way past it surfaces the same sentence.
 */
export function useAcknowledgedWrite(): {
	/** Run a write; `acknowledgements` is empty on the first attempt. */
	readonly run: (write: (acknowledgements: StopAcknowledgements) => Promise<void>) => Promise<void>;
	/** Render inside the page. Null until a write is refused with a question. */
	readonly dialog: ReactNode;
} {
	const [pending, setPending] = useState<{
		readonly write: (acknowledgements: StopAcknowledgements) => Promise<void>;
		readonly acknowledgements: StopAcknowledgements;
		readonly refusal: AcknowledgeableRefusal;
		readonly reason: string;
	} | null>(null);

	const attempt = useCallback(
		async (
			write: (acknowledgements: StopAcknowledgements) => Promise<void>,
			acknowledgements: StopAcknowledgements,
		) => {
			try {
				await write(acknowledgements);
				setPending(null);
			} catch (error) {
				const refusal = acknowledgeableRefusalOf(error);
				if (refusal === null) {
					// Not a question — hand it back to whatever the caller does with a
					// failed save.
					throw error;
				}
				setPending({
					acknowledgements,
					reason: messageFromBody(
						(error as { readonly body?: unknown }).body,
						'This record does not match the stop it was recorded from.',
					),
					refusal,
					write,
				});
			}
		},
		[],
	);

	const run = useCallback(
		(write: (acknowledgements: StopAcknowledgements) => Promise<void>) => attempt(write, {}),
		[attempt],
	);

	const dialog =
		pending === null ? null : (
			<Dialog onOpenChange={(next) => (next ? undefined : setPending(null))} open>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Record this anyway?</DialogTitle>
						<DialogDescription>{pending.reason}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setPending(null)} type="button" variant="ghost">
							Back
						</Button>
						<Button
							onClick={() => {
								void attempt(
									pending.write,
									withAcknowledgement(pending.acknowledgements, pending.refusal),
								);
							}}
							type="button"
						>
							Record it
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);

	return { dialog, run };
}
