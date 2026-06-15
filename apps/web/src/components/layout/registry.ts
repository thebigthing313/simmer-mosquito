import type { ComponentType } from 'react';
import { ClassicDetailExample } from './classic/examples/detail-with-map';
import { ClassicMapExample } from './classic/examples/map-driven';
import { ClassicPlainExample } from './classic/examples/no-map';
import { DualPaneDetailExample } from './dual-pane/examples/detail-with-map';
import { DualPaneMapExample } from './dual-pane/examples/map-driven';
import { DualPanePlainExample } from './dual-pane/examples/no-map';
import { RailDetailExample } from './rail/examples/detail-with-map';
import { RailMapExample } from './rail/examples/map-driven';
import { RailPlainExample } from './rail/examples/no-map';

export const PAGE_KEYS = ['map', 'detail', 'plain'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const pageLabels: Record<PageKey, string> = {
	map: 'Map-driven',
	detail: 'Detail + map',
	plain: 'No map',
};

export interface DesignEntry {
	readonly key: string;
	readonly label: string;
	readonly description: string;
	readonly examples: Record<PageKey, ComponentType>;
}

/** Registry consumed by the `/layout-preview` route to render any design × page. */
export const designs: readonly DesignEntry[] = [
	{
		key: 'classic',
		label: 'Classic console',
		description: 'Fixed full-height sidebar + sticky context header.',
		examples: { map: ClassicMapExample, detail: ClassicDetailExample, plain: ClassicPlainExample },
	},
	{
		key: 'rail',
		label: 'Rail + command bar',
		description: 'Collapsible icon rail + breadcrumb command bar.',
		examples: { map: RailMapExample, detail: RailDetailExample, plain: RailPlainExample },
	},
	{
		key: 'dual-pane',
		label: 'Dual-pane workspace',
		description: 'Compact nav + context pane + tabbed header.',
		examples: {
			map: DualPaneMapExample,
			detail: DualPaneDetailExample,
			plain: DualPanePlainExample,
		},
	},
];

export const DEFAULT_DESIGN = 'classic';
export const DEFAULT_PAGE: PageKey = 'map';

function isPageKey(value: string): value is PageKey {
	return (PAGE_KEYS as readonly string[]).includes(value);
}

/** Resolve a design × page pair to its example component, or `undefined` if unknown. */
export function getExample(design: string, page: string): ComponentType | undefined {
	if (!isPageKey(page)) {
		return undefined;
	}

	return designs.find((entry) => entry.key === design)?.examples[page];
}
