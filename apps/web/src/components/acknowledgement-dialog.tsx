import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import type { DeleteImpactEntry } from '../hooks/use-delete-impact';
import { impactCountLabel } from '../hooks/use-delete-impact';
import { acknowledgementCopyFor } from '../lib/acknowledgement-copy';

/**
 * One question, from the flag the server named and the counts it sent.
 *
 * The server's own `message` is deliberately not shown: it is written for a
 * developer reading a response body. The words come from
 * `ACKNOWLEDGEMENT_COPY`, and a flag with no entry gets a sentence built from
 * the counts rather than a dead end.
 */
export function AcknowledgementDialog({
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
