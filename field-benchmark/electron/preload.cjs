const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set([
	'tanstack-db:sqlite-persistence',
	'bench:db-size',
	'bench:wipe',
	'bench:basemap-info',
	'bench:range',
	'bench:download-basemap',
	'bench:since-process-start',
	'bench:append-log',
	'bench:read-log',
	'bench:share-log',
]);

contextBridge.exposeInMainWorld('benchElectron', {
	invoke: (channel, ...args) => {
		if (!CHANNELS.has(channel)) return Promise.reject(new Error(`channel ${channel} is not exposed`));
		return ipcRenderer.invoke(channel, ...args);
	},
	onDownloadProgress: (cb) => {
		const listener = (_e, bytes) => cb(bytes);
		ipcRenderer.on('bench:download-progress', listener);
		return () => ipcRenderer.removeListener('bench:download-progress', listener);
	},
});
