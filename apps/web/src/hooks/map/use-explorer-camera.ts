import { useState } from 'react';
import { getServerUrl } from '../../auth';
import type { MapCamera } from '../../components/map/map-styles';
import { buildRegionExtentUrl } from '../../components/map/region-tiles';
import { explorerCameraKey, readExplorerCamera } from '../../lib/explorer-camera';
import { useAuthSnapshot } from '../use-auth-snapshot';
import type { MapExtentFitSource } from './use-map-extent-fit';

export interface ExplorerCamera {
	/** Where the map opens: the stored camera, or `undefined` for the default. */
	readonly initialCamera: MapCamera | undefined;
	/**
	 * What to frame on a first visit, when nothing is stored: every Region the
	 * Organization has. `null` when a camera was stored, or memory is off.
	 */
	readonly firstVisitFit: MapExtentFitSource | null;
	/** The key to keep the camera under, or `null` when there is nowhere to keep it. */
	readonly storageKey: string | null;
}

const OFF: ExplorerCamera = { initialCamera: undefined, firstVisitFit: null, storageKey: null };

/**
 * Where an explorer map opens, read once when the map mounts.
 *
 * Every explorer shares one camera per Organization, so moving from Habitats to
 * Traps opens on the ground the reader was looking at. With nothing stored,
 * the map opens on the default camera and frames the Organization's Regions;
 * with no Regions either, the extent read answers nothing and the default
 * stands. Takes whether memory is on for this map.
 */
export function useExplorerCamera(enabled: boolean): ExplorerCamera {
	const auth = useAuthSnapshot();
	const organizationId = auth?.authenticated === true ? auth.localIdentity.organizationId : null;

	// Read once, on mount: the camera this map writes as it moves is for the next
	// map to open on, and reading it back here would re-key nothing useful.
	const [opening] = useState<ExplorerCamera>(() => {
		if (!enabled) {
			return OFF;
		}
		const storageKey = organizationId === null ? null : explorerCameraKey(organizationId);
		const initialCamera = storageKey === null ? undefined : readExplorerCamera(storageKey);
		return {
			initialCamera,
			firstVisitFit:
				initialCamera === undefined ? { url: buildRegionExtentUrl(getServerUrl()) } : null,
			storageKey,
		};
	});
	return opening;
}
