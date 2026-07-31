import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { customFieldDescriptors } from '../forms/field-components';

/**
 * The custom fields a lookup row declares, named, for catalog tables.
 *
 * A "Configured" or "3 fields" chip told a reader that *something* was set up
 * without saying what — and the only way to find out was to open the edit
 * drawer for every row. Naming the fields makes the catalog answerable at a
 * glance. Required fields carry the same `*` marker forms use.
 */
export function CustomFieldsCell({ schema }: { readonly schema: unknown }) {
	const descriptors = customFieldDescriptors(schema);
	if (descriptors.length === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<span className="flex flex-wrap gap-1">
			{descriptors.map((descriptor) => (
				<Badge
					key={descriptor.key}
					title={descriptor.required ? `${descriptor.label} (required)` : descriptor.label}
					tone="info"
					variant="outline"
				>
					{descriptor.label}
					{descriptor.required ? <span className="text-[var(--danger)]">*</span> : null}
				</Badge>
			))}
		</span>
	);
}
