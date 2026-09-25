import { tagPalette } from '@simmer-mosquito/design-tokens';
import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TableCell, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import { validHexColor } from '../../lib/hex-color';
import { relevanceSummary } from '../../lib/tag-relevance';
import { TagBadge } from '../tag-badge';
import { EditIcon } from './constants';

export function TagDisplayTableRow({
	canManage,
	onEdit,
	tag,
}: {
	readonly canManage: boolean;
	readonly onEdit: () => void;
	readonly tag: TagRecord;
}) {
	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column)">
				<TagBadge tag={tag} />
			</TableCell>
			<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
				{tag.description ?? <AbsentValue />}
			</TableCell>
			{/* Muted text rather than chips: a chip one cell over from the Tag
			    Preview badge reads as six more tags on the row. It draws for
			    everyone, the way the other read cells do. */}
			<TableCell className="w-(--tag-relevance-column) whitespace-normal text-muted-foreground">
				{relevanceSummary(tag.relevantEntityTypes)}
			</TableCell>
			<TableCell className="w-(--tag-color-column)">
				<TagColorSwatch color={tag.color} />
			</TableCell>
			{canManage ? (
				<TableCell className="w-(--tag-actions-column) text-right">
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						<EditIcon aria-hidden="true" />
						Edit
					</Button>
				</TableCell>
			) : null}
		</TableRow>
	);
}

/**
 * The Color column: a swatch of the picked colour, named by its palette label,
 * with the hex in the tooltip. The bare hex it used to print named the colour
 * in a form nobody reads, and the chip one column over already shows it drawn.
 */
function TagColorSwatch({ color }: { readonly color: string | null }) {
	const normalized = validHexColor(color);
	const label =
		normalized === null
			? 'Default'
			: (tagPalette.find((entry) => entry.hex.toLowerCase() === normalized.toLowerCase())?.label ??
				'Custom');

	return (
		<span className="inline-flex items-center gap-2" title={normalized ?? undefined}>
			<span
				aria-hidden="true"
				className="size-4 rounded-sm border border-border bg-muted"
				style={normalized === null ? undefined : { backgroundColor: normalized }}
			/>
			<span className="text-muted-foreground text-xs">{label}</span>
		</span>
	);
}
