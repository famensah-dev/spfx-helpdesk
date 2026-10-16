import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const rootModules = fileURLToPath(new URL('./node_modules/', import.meta.url));
export default defineConfig({
  resolve: { alias: [
    { find: /^react$/, replacement: `${rootModules}react/index.js` },
    { find: /^react-dom$/, replacement: `${rootModules}react-dom/index.js` },
    { find: /^@fluentui\/react$/, replacement: `${rootModules}@fluentui/react/lib/index.js` },
    { find: /^react-chartjs-2$/, replacement: `${rootModules}react-chartjs-2/dist/index.js` },
    { find: /^chart.js$/, replacement: `${rootModules}chart.js/dist/chart.js` }
  ] },
  server: { proxy: {'/api': {target: 'http://127.0.0.1:7071', changeOrigin: false}}, port: 5173, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', sourcemap: false }
});
