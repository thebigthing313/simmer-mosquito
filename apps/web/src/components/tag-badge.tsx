import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type { Tag } from '../hooks/queries/tag-view';
import { tagChipStyle } from '../lib/hex-color';

/**
 * A tag chip tinted with the tag's own color, falling back to a neutral
 * secondary badge when the tag has no (valid) color. Shared across the
 * explorer and detail surfaces that surface assigned tags.
 */
export function TagBadge({ tag }: { readonly tag: Pick<Tag, 'name' | 'color' | 'description'> }) {
	const style = tagChipStyle(tag.color);

	return (
		<Badge
			style={style ?? undefined}
			title={tag.description ?? undefined}
			variant={style === null ? 'secondary' : 'outline'}
		>
			{tag.name}
		</Badge>
	);
}
