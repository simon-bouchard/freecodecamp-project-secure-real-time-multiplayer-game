import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

/**
 * Express app serving the built client with security headers. With `devClientUrl` (during
 * `npm run dev`) it serves a pointer to the Vite dev page instead of a possibly stale build.
 */
export function createApp(clientDir: string, devClientUrl?: string): express.Express {
	const app = express();

	app.use(
		helmet({
			contentSecurityPolicy: {
				useDefaults: false,
				directives: {
					defaultSrc: ["'self'"],
					scriptSrc: ["'self'"],
					styleSrc: ["'self'"],
					imgSrc: ["'self'", 'data:'],
					connectSrc: ["'self'"],
					objectSrc: ["'none'"],
					baseUri: ["'self'"],
					frameAncestors: ["'none'"],
				},
			},
		}),
	);

	if (devClientUrl) {
		app.get('/', (_req, res) => {
			res
				.type('html')
				.send(
					`<!doctype html><title>Coin Race (dev)</title><p>Development mode: open ` +
						`<a href="${devClientUrl}">${devClientUrl}</a> to play.</p>`,
				);
		});
	}

	app.use(
		express.static(clientDir, {
			setHeaders: (res, filePath) => {
				if (filePath.endsWith('.html')) {
					res.setHeader('Cache-Control', 'no-store');
				}
			},
		}),
	);

	app.get('/', (_req, res) => {
		res.setHeader('Cache-Control', 'no-store');
		res.sendFile(path.join(clientDir, 'index.html'));
	});

	app.use((_req, res) => {
		res.status(404).type('text').send('Not Found');
	});

	return app;
}
