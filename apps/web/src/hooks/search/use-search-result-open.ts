import {
	type SearchDestination,
	searchResultDestination,
} from '../../components/search/search-destinations';
import { type DeferredOpen, useDeferredOpen } from './use-deferred-open';
import { useRouteTypeIndex } from './use-route-type-index';

/**
 * Opens a search result whose rows are records and comments, resolving each
 * against the route type index and deferring the open until it can.
 */
export function useSearchResultOpen(open: (destination: SearchDestination) => void): DeferredOpen {
	const routeTypes = useRouteTypeIndex();
	return useDeferredOpen((result) => searchResultDestination(result, routeTypes), open);
}
