import {
	customFieldEntries,
	formatCustomFieldValue,
} from '@simmer-mosquito/ui-web/components/form';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';

/**
 * The name/value pairs an agency's custom schema puts on a record.
 *
 * Labels **wrap** rather than truncate. Every other label on a detail page is
 * one we wrote and can keep short; these are typed by the agency into the method
 * or type editor, at whatever length their program needs — "Applicator License
 * Number", "Standing Water Depth (in)". Clipped to a 120px column those read as
 * "Applicator Lic…" and "Standing Water…", and a field's label is the entire
 * explanation of what its value means, so a clipped one leaves a number on the
 * page with nothing saying what it counts.
 *
 * The column stays fixed so the values still line up as a list; a long label
 * takes a second line rather than pushing the value around. The tooltip that a
 * truncation would need is not an answer here — it is invisible to a touch
 * device and to anyone scanning the card.
 *
 * Rendered as a bare `<dl>` so callers choose the frame: {@link CustomFieldsCard}
 * gives it a card of its own, while the habitat page folds it into the details
 * card under its own heading.
 */
export function CustomFieldsList({
	entries,
}: {
	readonly entries: ReturnType<typeof customFieldEntries>;
}) {
	return (
		<dl className="grid gap-2.5">
			{entries.map((entry) => {
				const value = formatCustomFieldValue(entry);
				return (
					<div
						className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-3 text-sm"
						key={entry.key}
					>
						<dt className="m-0 min-w-0 wrap-anywhere text-pretty text-muted-foreground leading-snug">
							{entry.label}
							{entry.declared ? null : (
								<>
									{' '}
									<Badge tone="neutral" variant="outline">
										Retired
									</Badge>
								</>
							)}
						</dt>
						<dd className="m-0 min-w-0 wrap-anywhere text-foreground">
							{value ?? <span className="text-muted-foreground">Not recorded</span>}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

/**
 * Read-only view of the custom fields an agency attached to a record's method or
 * type. Renders nothing when the method declares no fields and the record carries
 * no values, so records without custom fields are not given an empty card.
 *
 * Declared-but-blank fields still show as "Not recorded" — a crew reading the
 * record should see what the method asks for, not just what was filled in.
 */
export function CustomFieldsCard({
	schema,
	metadata,
	title = 'Custom Fields',
}: {
	/** The method's / type's `customSchema`. */
	readonly schema: unknown;
	/** The record's `metadata` column. */
	readonly metadata: unknown;
	readonly title?: string;
}) {
	const entries = customFieldEntries(schema, metadata);
	if (entries.length === 0) {
		return null;
	}

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<CustomFieldsList entries={entries} />
			</CardContent>
		</Card>
	);
}
