import path from 'node:path';
import { startServer } from './server.js';

const server = await startServer({
	port: Number(process.env.PORT ?? 3000),
	clientDir: path.resolve('dist/client'),
});
console.log(`Coin Race listening on http://localhost:${server.port}`);
