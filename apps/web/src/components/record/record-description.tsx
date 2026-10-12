import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';

/**
 * A record's free-text description on its detail page, under a `Description`
 * eyebrow, with the line breaks it was written with.
 *
 * Takes the description and, for a record whose page shows a line where the
 * description would be, the `emptyText` to draw when it is blank. Without
 * `emptyText` a blank description draws nothing.
 */
export function RecordDescription({
	emptyText,
	text,
}: {
	readonly emptyText?: string;
	readonly text: string | null;
}) {
	const written = text?.trim() ? text : null;
	if (written === null && emptyText === undefined) {
		return null;
	}
	return (
		<div className="grid gap-1">
			<span className={eyebrow()}>Description</span>
			<p className="m-0 max-w-[70ch] whitespace-pre-wrap break-words text-foreground text-sm">
				{written ?? emptyText}
			</p>
		</div>
	);
}
