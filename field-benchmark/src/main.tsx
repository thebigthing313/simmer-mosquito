import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { logResult } from './bench/log';
import { createCollections } from './data/collections';
import { detectPlatform } from './platform';

const bootStarted = performance.now();
const platform = detectPlatform();

async function boot() {
	const root = createRoot(document.getElementById('root') as HTMLElement);
	try {
		const persistence = await platform.persistence();
		const collections = createCollections(persistence);
		await Promise.all([
			...Object.values(collections.synced).map((c) => c.preload()),
			collections.queue.preload(),
		]);
		const hydratedMs = performance.now() - bootStarted;
		root.render(<App platform={platform} collections={collections} hydratedMs={hydratedMs} />);
	} catch (error) {
		const message = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
		root.render(<pre className="fatal">{message}</pre>);
		await logResult(platform, { type: 'boot-error', message });
	}
}

boot();
