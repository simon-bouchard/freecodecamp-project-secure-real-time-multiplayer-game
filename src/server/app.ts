import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

/** Express app serving the built client with security headers. */
export function createApp(clientDir: string): express.Express {
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
