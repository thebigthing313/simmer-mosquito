import { useState } from 'react';
import { getServerUrl } from '../../auth';
import type { MapCamera } from '../../components/map/map-styles';
import { allRegionsExtentUrl } from '../../components/map/tile-layers';
import { explorerCameraKey, readExplorerCamera } from '../../lib/explorer-camera';
import { useAuthSnapshot } from '../use-auth-snapshot';
import type { MapExtentFitSource } from './use-map-extent-fit';

export interface OrganizationAreaOpening {
	/** The explorer camera stored for this Organization, or `undefined` for none. */
	readonly initialCamera: MapCamera | undefined;
	/**
	 * Every Region the Organization has, while the map has no rows and no stored
	 * camera to open on. `null` otherwise.
	 */
	readonly fit: MapExtentFitSource | null;
}

const OFF: OrganizationAreaOpening = { initialCamera: undefined, fit: null };

/**
 * Where a map that fits only to its own rows opens while it has none: the
 * camera the explorers last stored, or else the extent of the Organization's
 * Regions. With neither, the map keeps the opening `useMapboxMap` gives it,
 * the Organization map centre or the continental US.
 *
 * Takes whether the page has no rows to put on the map, or `undefined` for a
 * map that frames something of its own and never wants this. It reads the
 * stored camera and never writes one.
 */
export function useOrganizationAreaOpening(empty: boolean | undefined): OrganizationAreaOpening {
	const auth = useAuthSnapshot();
	const organizationId = auth?.authenticated === true ? auth.localIdentity.organizationId : null;

	// Read once, on mount, like the explorers: a later read would only move a
	// map the reader may already have panned.
	const [initialCamera] = useState<MapCamera | undefined>(() =>
		empty === undefined || organizationId === null
			? undefined
			: readExplorerCamera(explorerCameraKey(organizationId)),
	);

	// Once the page has had rows, the map has been framed on them. A filter that
	// empties it later leaves the camera where the reader had it.
	const [hadRows, setHadRows] = useState(false);
	if (empty === false && !hadRows) {
		setHadRows(true);
	}

	if (empty === undefined) {
		return OFF;
	}
	const fit =
		empty && !hadRows && initialCamera === undefined
			? { url: allRegionsExtentUrl(getServerUrl()) }
			: null;
	return { initialCamera, fit };
}
