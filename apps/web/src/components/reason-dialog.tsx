import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useState } from 'react';

/**
 * A confirmation that collects prose.
 *
 * Every lifecycle action that closes something off asks a version of the same
 * question — why was this stop passed over, why was the whole thing called off,
 * how was this request resolved — and the answer is written into the record
 * rather than thrown away. Some of those answers are required and some are not,
 * so `required` is a prop instead of there being near-identical dialogs drifting
 * apart on wording.
 *
 * Shared rather than route-local because the two callers are now in different
 * domains: mission and assignment worklists under `routes/operations`, and
 * service request closure under `routes/public-engagement`.
 */
export function ReasonDialog({
	open,
	title,
	description,
	placeholder,
	confirmLabel,
	required,
	onConfirm,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly title: string;
	readonly description: string;
	readonly placeholder: string;
	readonly confirmLabel: string;
	readonly required: boolean;
	readonly onConfirm: (reason: string) => void;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const [reason, setReason] = useState('');

	return (
		<Dialog
			onOpenChange={(next) => {
				if (!next) {
					setReason('');
				}
				onOpenChange(next);
			}}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<Textarea
					aria-label="Reason"
					className="min-h-[88px]"
					maxLength={2_000}
					onChange={(event) => setReason(event.target.value)}
					placeholder={placeholder}
					value={reason}
				/>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
						Back
					</Button>
					<Button
						disabled={required && reason.trim().length === 0}
						onClick={() => {
							onConfirm(reason);
							setReason('');
						}}
						type="button"
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
