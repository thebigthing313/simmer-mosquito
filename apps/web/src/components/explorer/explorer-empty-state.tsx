import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { ReactNode } from 'react';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { WriteOnly } from '../write-only';
import type { ExplorerCreateAction } from './explorer-header';

/**
 * Why a paged rail is empty, read off state the explorer already holds.
 *
 * - `viewport`: the filtered set has an extent, so there are matches somewhere
 *   and the bounded page happens to hold none. Pan or zoom.
 * - `filters`: the extent is null and the request narrowed by something, a
 *   default window or status included. Nothing matches anywhere.
 * - `none`: the extent is null and the request carried no filter at all. The
 *   Organization has none of this record kind.
 *
 * The extent is what settles it, and it is the one the map already fetched to
 * frame its data, so the rail sends nothing extra to say which (#958).
 *
 * A default that narrows counts as a filter here even though the surface's
 * `activeFilterCount` says zero, because the count is "off default" and the
 * question is "did the server apply one". Every one of the nine paged explorers
 * opens narrowed, seven on a date window and two on active status, so a null
 * extent at the defaults says nothing about what sits outside them. `none`
 * is reached by choosing All time or All status, which is when the sentence
 * "No habitats yet" is true.
 */
export type ExplorerEmptyReason = 'viewport' | 'filters' | 'none';

/** What the rail draws when the page holds nothing, and what it is a page of. */
export interface ExplorerEmptiness {
	readonly recordType: RecordType;
	/**
	 * Null while the extent request is in flight. The resource reports loading
	 * then, so the rail draws its placeholders and reads none of the three.
	 */
	readonly reason: ExplorerEmptyReason | null;
}

/** The empty state, in the three pieces `ResultList` draws. */
export interface EmptyRailCopy {
	readonly emptyTitle: string;
	readonly emptyDescription?: string;
	readonly emptyAction?: ReactNode;
}

/**
 * The three sentences a paged rail can say when it holds nothing, written once
 * for nine surfaces. The noun is the register's, so the rail and the surface's
 * heading agree, and none of the nine can spell a record its own way again:
 * `releases`, `source reduction` and `outreach` were three of the titles before
 * this (#894).
 *
 * The create pointer reads the label the panel menu draws, so the sentence and
 * the control agree by construction, and it sits behind the same role floor the
 * control does. A reader who cannot add one is not pointed at a control they
 * cannot see.
 *
 * The filter affordance depends on whether anything is off its default. With
 * filters set, the surface's own reset puts them back. At the defaults there is
 * nothing to reset, and what narrowed the request is in the filter card, so the
 * control opens it.
 */
export function emptyRailCopy({
	empty,
	create,
	activeFilterCount,
	onResetFilters,
	onShowFilters,
}: {
	readonly empty: ExplorerEmptiness;
	readonly create: ExplorerCreateAction | undefined;
	readonly activeFilterCount: number;
	readonly onResetFilters: (() => void) | undefined;
	readonly onShowFilters: (() => void) | undefined;
}): EmptyRailCopy {
	const { many } = recordNoun(empty.recordType);
	switch (empty.reason) {
		case 'filters':
			return {
				emptyTitle: `No ${many} match these filters`,
				emptyAction: filterAction(activeFilterCount, onResetFilters, onShowFilters),
			};
		case 'none':
			return {
				emptyTitle: `No ${many} yet`,
				emptyAction: create === undefined ? undefined : <CreatePointer create={create} />,
			};
		default:
			return {
				emptyTitle: `No ${many} in view`,
				emptyDescription: `Pan or zoom the map, or loosen the filters to bring ${many} into range.`,
			};
	}
}

function filterAction(
	activeFilterCount: number,
	onResetFilters: (() => void) | undefined,
	onShowFilters: (() => void) | undefined,
): ReactNode {
	if (activeFilterCount > 0 && onResetFilters !== undefined) {
		return (
			<Button className="mt-1" onClick={onResetFilters} size="sm" variant="outline">
				Reset filters
			</Button>
		);
	}
	if (onShowFilters === undefined) {
		return undefined;
	}
	return (
		<Button className="mt-1" onClick={onShowFilters} size="sm" variant="outline">
			Show filters
		</Button>
	);
}

/** Where the create control is, by the name it draws. */
function CreatePointer({ create }: { readonly create: ExplorerCreateAction }) {
	return (
		<WriteOnly minimum={create.minimum ?? 'collector'}>
			<p className="max-w-[34ch] text-muted-foreground text-sm">
				{create.label} is in the More actions menu.
			</p>
		</WriteOnly>
	);
}
