import './worker';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { addProtocol, type StyleSpecification } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';

const protocol = new Protocol();
addProtocol('pmtiles', protocol.tile);

/**
 * The basemap style: a Protomaps light flavor over one PMTiles file, glyphs and
 * sprites from the app bundle (#1359). With a local file the tiles come through
 * the shell's range-read Source; without one, over HTTP range requests from the
 * LAN server, which stands in for the bucket's master copy.
 */
export function basemapStyle(local: Source | null, remoteUrl: string): StyleSpecification {
	let url: string;
	if (local) {
		protocol.add(new PMTiles(local));
		url = `pmtiles://${local.getKey()}`;
	} else {
		url = `pmtiles://${remoteUrl}`;
	}
	const assets = new URL('map-assets/', location.href).href;
	return {
		version: 8,
		glyphs: `${assets}fonts/{fontstack}/{range}.pbf`,
		sprite: `${assets}sprites/v4/light`,
		sources: {
			protomaps: {
				type: 'vector',
				url,
				attribution: '© OpenStreetMap',
			},
		},
		layers: layers('protomaps', namedFlavor('light'), { lang: 'en' }),
	};
}
