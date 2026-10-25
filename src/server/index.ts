import path from 'node:path';
import { SqliteScoreStore } from './scores/sqlite.js';
import { startServer } from './server.js';

const server = await startServer({
	port: Number(process.env.PORT ?? 3000),
	clientDir: path.resolve('dist/client'),
	devClientUrl: process.env.COIN_RACE_DEV_URL,
	scores: new SqliteScoreStore(process.env.COIN_RACE_DB ?? path.resolve('data/coin-race.db')),
});
console.log(`Coin Race listening on http://localhost:${server.port}`);
