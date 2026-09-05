/**
 * Emits a standalone preview harness for the four styles.
 *
 * A Mapbox style is unreviewable as JSON — the whole design lives in how zoom
 * stops interact, and no amount of reading the source tells you whether the
 * staged reveal actually feels right. This page exists so the styles can be
 * walked before anything is uploaded to Studio.
 *
 * The styles are inlined rather than fetched so the file opens straight off
 * disk. `fetch('./simmer-day.json')` would need a static server, which is one
 * more step between a change and seeing it.
 */

const STAGES = [
	[0, 9, 'z3-8 · organization overview — water, wetland, boundaries. Land flat, no roads.'],
	[9, 12, 'z9-11 · district — land cover in, terrain fading in, major roads only.'],
	[12, 15, 'z12-14 · neighbourhood — full road network + names, land cover fading out.'],
	[15, 24, 'z15+ · site — buildings in, terrain and land cover gone.'],
];

export function renderPreview(styles) {
	const inlined = JSON.stringify(
		Object.fromEntries(styles.map((s) => [s.metadata['simmer:variant'], s])),
	);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SIMMER basemap preview</title>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet" />
<style>
	:root {
		--surface: #fdfefd;
		--border: #c3d2ce;
		--text: #24302e;
		--muted: #556663;
		--green: #0c5331;
	}
	* { box-sizing: border-box; }
	html, body { margin: 0; height: 100%; font-family: Poppins, ui-sans-serif, system-ui, sans-serif; }
	#map { position: absolute; inset: 0; }
	#panel {
		position: absolute; top: 16px; left: 16px; z-index: 10; width: 320px;
		background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
		padding: 16px; color: var(--text); font-size: 14px;
		box-shadow: 0 10px 30px rgb(24 38 50 / 8%);
	}
	h1 { font-size: 0.76rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
		margin: 0 0 12px; color: var(--muted); }
	.variants { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
	button {
		font: inherit; font-size: 13px; height: 34px; border-radius: 6px; cursor: pointer;
		border: 1px solid var(--border); background: var(--surface); color: var(--text);
	}
	button[aria-pressed="true"] { background: var(--green); border-color: var(--green); color: #fff; }
	button:focus-visible { outline: 2px solid #b8891a; outline-offset: 2px; }
	input {
		width: 100%; height: 36px; padding: 0 10px; font: inherit; font-size: 13px;
		border: 1px solid #8fa39e; border-radius: 6px; margin-bottom: 10px; color: var(--text);
	}
	#stage { font-size: 12px; line-height: 1.5; color: var(--muted); border-top: 1px solid var(--border);
		padding-top: 10px; margin-top: 4px; }
	#zoom { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text); }
	#err { color: #b3123b; font-size: 12px; line-height: 1.5; }
	code { background: #eaf0ed; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
</style>
</head>
<body>
<div id="map"></div>
<div id="panel">
	<h1>SIMMER basemap preview</h1>
	<input id="token" type="text" placeholder="Mapbox public token (pk....)" autocomplete="off" spellcheck="false" />
	<div class="variants" id="variants"></div>
	<div id="stage">Zoom <span id="zoom">—</span><br /><span id="stagetext">Enter a public token to start.</span></div>
	<div id="err"></div>
</div>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"></script>
<script>
const STYLES = ${inlined};
const STAGES = ${JSON.stringify(STAGES)};
const ids = Object.keys(STYLES);
let active = ids[0];
let map = null;

const tokenInput = document.getElementById('token');
const variants = document.getElementById('variants');
const zoomEl = document.getElementById('zoom');
const stageEl = document.getElementById('stagetext');
const errEl = document.getElementById('err');

tokenInput.value = localStorage.getItem('simmer-preview-token') || '';

for (const id of ids) {
	const button = document.createElement('button');
	button.textContent = STYLES[id].name.replace('SIMMER ', '');
	button.setAttribute('aria-pressed', String(id === active));
	button.onclick = () => {
		active = id;
		for (const other of variants.children) {
			other.setAttribute('aria-pressed', String(other === button));
		}
		if (map) map.setStyle(STYLES[id]);
	};
	variants.appendChild(button);
}

function describeStage(zoom) {
	for (const [lo, hi, text] of STAGES) {
		if (zoom >= lo && zoom < hi) return text;
	}
	return '';
}

function start(token) {
	errEl.textContent = '';
	mapboxgl.accessToken = token;
	if (map) { map.remove(); map = null; }
	try {
		map = new mapboxgl.Map({
			container: 'map',
			style: STYLES[active],
			center: [-119.35, 36.33],
			zoom: 9,
		});
	} catch (error) {
		errEl.textContent = String(error && error.message ? error.message : error);
		return;
	}
	map.addControl(new mapboxgl.NavigationControl(), 'top-right');
	map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
	const report = () => {
		const zoom = map.getZoom();
		zoomEl.textContent = zoom.toFixed(1);
		stageEl.textContent = describeStage(zoom);
	};
	map.on('load', report);
	map.on('zoom', report);
	map.on('error', (event) => {
		const message = event && event.error && event.error.message;
		if (message) errEl.textContent = message;
	});
}

tokenInput.addEventListener('change', () => {
	const token = tokenInput.value.trim();
	if (!token) return;
	localStorage.setItem('simmer-preview-token', token);
	start(token);
});

if (tokenInput.value.trim()) start(tokenInput.value.trim());
</script>
</body>
</html>
`;
}
