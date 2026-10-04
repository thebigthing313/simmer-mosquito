// LAN server for the benchmark: the data bundle (gzip) and the basemap (range
// requests), with CORS open so the APK, the Electron build and the Vite dev page
// can all read it. Run on the developer's PC; the device enters the printed URL.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'

const port = Number(process.env.PORT ?? 8787)
const root = new URL('../data/', import.meta.url)

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Range, Cache-Control',
	'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, Content-Encoding',
}

createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
	if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
	const started = Date.now()
	res.on('finish', () => console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms ${req.headers.range ?? ''}`))

	if (path.startsWith('/bundle/') && path.endsWith('.json')) {
		const file = new URL(`.${path}`, root)
		const gz = new URL(`.${path}.gz`, root)
		if (!existsSync(file)) return res.writeHead(404, cors).end()
		const useGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && existsSync(gz)
		const served = useGzip ? gz : file
		res.writeHead(200, {
			...cors,
			'Content-Type': 'application/json',
			'Content-Length': statSync(served).size,
			'Cache-Control': 'no-store',
			...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
		})
		return createReadStream(served).pipe(res)
	}

	if (path === '/basemap.pmtiles') {
		const file = new URL('./basemap.pmtiles', root)
		if (!existsSync(file)) return res.writeHead(404, cors).end()
		const size = statSync(file).size
		const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
		if (range) {
			const start = Number(range[1])
			const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
			res.writeHead(206, {
				...cors,
				'Content-Type': 'application/octet-stream',
				'Content-Range': `bytes ${start}-${end}/${size}`,
				'Content-Length': end - start + 1,
				'Accept-Ranges': 'bytes',
				ETag: `"${size}"`,
			})
			return createReadStream(file, { start, end }).pipe(res)
		}
		res.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Accept-Ranges': 'bytes', ETag: `"${size}"` })
		return createReadStream(file).pipe(res)
	}

	res.writeHead(404, cors).end()
}).listen(port, '0.0.0.0', () => {
	console.log(`serving data/ on port ${port}`)
	for (const list of Object.values(networkInterfaces()))
		for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  http://${i.address}:${port}`)
})
