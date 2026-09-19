import { useState } from 'react';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { useTrapCollections } from '../../hooks/queries/use-trap-collections';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { CollectionYears } from './collection-years';
import { type DirectoryCollection, groupByYear } from './trap-directory-data';
import { TrapHeader } from './trap-header';

/** How many seasons load without being asked for. The window is {@link useTrapCollections}'s. */
const DEFAULT_SEASONS = 3;

/**
 * Everything one trap has produced, a season at a time. Each collection stays
 * collapsed until it is opened.
 */
export function TrapCollectionHistory({ trap }: { readonly trap: TrapListing }) {
	// Older seasons are asked for, not loaded up front, see DEFAULT_SEASONS.
	const [allSeasons, setAllSeasons] = useState(false);
	const timeZone = useOrganizationTimeZone();

	const { collections, isReady, isError } = useTrapCollections(trap.id, {
		seasons: allSeasons ? null : DEFAULT_SEASONS,
		timeZone,
	});

	const years = groupByYear(collections as readonly DirectoryCollection[], timeZone);

	// Resolved once for the pane rather than inside each row: reading the catalog
	// per expanded collection would put a query behind every disclosure on the page.
	const speciesNameById = useSpeciesNames();

	return (
		<CollectionYears
			header={<TrapHeader trap={trap} />}
			isError={isError}
			isReady={isReady}
			onLoadEarlier={allSeasons ? undefined : () => setAllSeasons(true)}
			speciesNameById={speciesNameById}
			timeZone={timeZone}
			years={years}
		/>
	);
}

// --- the trap ---------------------------------------------------------------
