// The Electron shell for the field benchmark. The main process owns the SQLite
// file (better-sqlite3 under TanStack's Node persistence, exposed over IPC as
// #1363 settled), the basemap file and its range reads, and the results log.
const { app, BrowserWindow, ipcMain, net, protocol, shell, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Database = require('better-sqlite3');
const { createNodeSQLitePersistence } = require('@tanstack/node-db-sqlite-persistence');
const { exposeElectronSQLitePersistence } = require('@tanstack/electron-db-sqlite-persistence/main');

protocol.registerSchemesAsPrivileged([
	{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const userData = app.getPath('userData');
const dbPath = path.join(userData, 'bench.sqlite');
const basemapPath = path.join(userData, 'basemap.pmtiles');
const logPath = path.join(userData, 'bench-results.jsonl');
const distDir = path.join(__dirname, '..', 'dist');

let database = null;
let disposePersistence = null;
let basemapFd = null;

function openDatabase() {
	database = new Database(dbPath);
	database.pragma('journal_mode = WAL');
	const persistence = createNodeSQLitePersistence({ database });
	disposePersistence = exposeElectronSQLitePersistence({ ipcMain, persistence });
}

function closeDatabase() {
	disposePersistence?.();
	disposePersistence = null;
	database?.close();
	database = null;
}

function fileSize(p) {
	try {
		return fs.statSync(p).size;
	} catch {
		return 0;
	}
}

function registerHandlers(win) {
	const check = (event) => {
		if (event.senderFrame?.url && !event.senderFrame.url.startsWith('app://bench/')) {
			throw new Error('refused: unexpected sender');
		}
	};
	ipcMain.handle('bench:db-size', (e) => {
		check(e);
		return fileSize(dbPath) + fileSize(`${dbPath}-wal`) + fileSize(`${dbPath}-shm`);
	});
	ipcMain.handle('bench:wipe', (e) => {
		check(e);
		closeDatabase();
		for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
		app.relaunch();
		app.exit(0);
	});
	ipcMain.handle('bench:basemap-info', (e) => {
		check(e);
		const bytes = fileSize(basemapPath);
		return bytes ? { bytes } : null;
	});
	ipcMain.handle('bench:range', (e, offset, length) => {
		check(e);
		if (basemapFd === null) basemapFd = fs.openSync(basemapPath, 'r');
		const buffer = Buffer.alloc(length);
		const read = fs.readSync(basemapFd, buffer, 0, length, offset);
		return new Uint8Array(buffer.buffer, buffer.byteOffset, read);
	});
	ipcMain.handle('bench:download-basemap', async (e, url) => {
		check(e);
		// Download to a temporary file and swap it in only when complete (#1359, item 8).
		const temp = `${basemapPath}.download`;
		const response = await net.fetch(url);
		if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
		const out = fs.createWriteStream(temp);
		let bytes = 0;
		let lastReport = 0;
		for await (const chunk of response.body) {
			bytes += chunk.length;
			if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
			if (bytes - lastReport > 1e6) {
				lastReport = bytes;
				win.webContents.send('bench:download-progress', bytes);
			}
		}
		await new Promise((r) => out.end(r));
		if (basemapFd !== null) {
			fs.closeSync(basemapFd);
			basemapFd = null;
		}
		fs.renameSync(temp, basemapPath);
		return { bytes };
	});
	ipcMain.handle('bench:since-process-start', (e) => {
		check(e);
		return Date.now() - process.getCreationTime();
	});
	ipcMain.handle('bench:append-log', (e, line) => {
		check(e);
		fs.appendFileSync(logPath, `${line}\n`);
	});
	ipcMain.handle('bench:read-log', (e) => {
		check(e);
		try {
			return fs.readFileSync(logPath, 'utf8');
		} catch {
			return '';
		}
	});
	ipcMain.handle('bench:share-log', (e, text) => {
		check(e);
		clipboard.writeText(text);
		shell.showItemInFolder(logPath);
	});
}

app.whenReady().then(() => {
	protocol.handle('app', (request) => {
		const { pathname } = new URL(request.url);
		const file = path.join(distDir, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
		if (!file.startsWith(distDir)) return new Response('forbidden', { status: 403 });
		return net.fetch(pathToFileURL(file).toString());
	});
	openDatabase();
	const win = new BrowserWindow({
		width: 1280,
		height: 860,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			sandbox: true,
			// Off for the whole app, as #1360 settled.
			backgroundThrottling: false,
		},
	});
	registerHandlers(win);
	win.removeMenu();
	win.webContents.on('before-input-event', (_e, input) => {
		if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
	});
	win.loadURL('app://bench/index.html');
});

app.on('window-all-closed', () => {
	closeDatabase();
	app.quit();
});
