import { useState } from 'react';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { useTrapCollections } from '../../hooks/queries/use-trap-collections';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { CollectionYears } from './collection-years';
import { type DirectoryCollection, groupByYear } from './trap-directory-data';
import { TrapHeader } from './trap-header';

/**
 * How many seasons load without being asked for. The window itself, and why it
 * exists, are in {@link useTrapCollections}.
 */
const DEFAULT_SEASONS = 3;

/**
 * Everything one trap has produced, read as a season at a time.
 *
 * The directory's right half. A trap's collections are a long, flat run of dates
 * that only becomes navigable once it is cut by year — an operator asking "what
 * did this trap do last summer" is asking a question about a season, not about
 * the most recent ten rows. Each collection stays collapsed until it is opened,
 * so the year reads as a run of dates first and a specimen list only on request.
 */
export function TrapCollectionHistory({ trap }: { readonly trap: TrapListing }) {
	// Older seasons are asked for, not loaded up front — see DEFAULT_SEASONS.
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
