// MapLibre 6 finds its worker beside its own module only on an http(s) URL, and
// Vite's dependency prebundling moves it, so the worker is bundled by Vite and
// named explicitly. That also covers Electron's app:// origin.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
