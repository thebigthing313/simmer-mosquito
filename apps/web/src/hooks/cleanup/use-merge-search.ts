import { convertUnitAmount, proximitySearchUnit } from '@simmer-mosquito/domain';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../components/app-shell';
import { mergeMapData, searchBounds } from '../../components/cleanup/habitat-merge-map';
import { useOrganizationSettings } from '../queries/use-organization-settings';
import { useNearbyHabitats } from '../use-merge-candidates';

/**
 * The habitat merge page's search: a radius in the organization's distance
 * unit, the target and candidates the nearby read returned for it, the map
 * data and the bounds that frame it. Sets the breadcrumb to the target's label.
 */
export function useMergeSearch(habitatId: string) {
	const unit = proximitySearchUnit(useOrganizationSettings().unitDefaults.distance);
	const [radius, setRadius] = useState(unit.steps[0] ?? 100);

	// Through the domain's conversion table rather than a factor written here.
	// `record-merge-reads.ts` and `coverage-features.ts` already convert that way,
	// and a second copy of 0.3048 is a second place for the two to disagree.
	const radiusMetres = convertUnitAmount(radius, unit.unitCode, 'meter') ?? radius;
	const nearby = useNearbyHabitats(habitatId, radiusMetres);
	const target = nearby.data?.target;
	const candidates = nearby.data?.candidates ?? [];

	// The uuid otherwise stands in the trail where the habitat's name belongs, the
	// way it does on every other by-id page.
	useBreadcrumbLabel(habitatId, target?.label ?? '');

	const mapData = mergeMapData(target, candidates, radiusMetres);

	const bounds = searchBounds(target, radiusMetres);

	return {
		bounds,
		candidates,
		mapData,
		nearby,
		radius,
		setRadius,
		target,
		unit,
	};
}
