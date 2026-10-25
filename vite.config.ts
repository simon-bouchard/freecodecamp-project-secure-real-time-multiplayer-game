import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: 'src/client',
	publicDir: '../../public',
	build: {
		outDir: '../../dist/client',
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		strictPort: true,
		proxy: {
			'/socket.io': { target: 'http://localhost:3000', ws: true },
		},
	},
	test: {
		root: '.',
		include: ['src/**/*.test.ts'],
		env: { TZ: 'UTC' },
	},
});
