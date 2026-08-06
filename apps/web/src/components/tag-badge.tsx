import type { TagRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type { CSSProperties } from 'react';
import { hexWithAlpha, validHexColor } from '../lib/hex-color';

/**
 * A tag chip tinted with the tag's own color, falling back to a neutral
 * secondary badge when the tag has no (valid) color. Shared across the
 * explorer and detail surfaces that surface assigned tags.
 */
export function TagBadge({ tag }: { readonly tag: TagRow }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
					'--tag-color': color,
				} as CSSProperties);

	return (
		<Badge
			className={
				color === null ? undefined : 'border-(--tag-border) bg-(--tag-bg) text-(--tag-color)'
			}
			style={style}
			title={tag.description ?? undefined}
			variant={color === null ? 'secondary' : 'outline'}
		>
			{tag.tagName}
		</Badge>
	);
}
