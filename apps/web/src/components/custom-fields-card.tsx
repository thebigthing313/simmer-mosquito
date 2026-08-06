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
				<dl className="grid gap-2.5">
					{entries.map((entry) => {
						const value = formatCustomFieldValue(entry);
						return (
							<div
								className="grid grid-cols-[minmax(0,110px)_1fr] items-baseline gap-3 text-sm"
								key={entry.key}
							>
								<dt className="flex min-w-0 items-baseline gap-1.5 text-muted-foreground">
									<span className="truncate">{entry.label}</span>
									{entry.declared ? null : (
										<Badge tone="neutral" variant="outline">
											Retired
										</Badge>
									)}
								</dt>
								<dd className="m-0 min-w-0 wrap-anywhere text-foreground">
									{value ?? <span className="text-muted-foreground">Not recorded</span>}
								</dd>
							</div>
						);
					})}
				</dl>
			</CardContent>
		</Card>
	);
}
