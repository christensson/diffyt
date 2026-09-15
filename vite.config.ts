import {resolve, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import {youtrackDevHtml, youtrackWidgetEntries} from '@jetbrains/youtrack-apps-tools/dx';

const isServing = process.argv.includes('--mode') === false && !process.argv.includes('build');

const currentDir = dirname(fileURLToPath(import.meta.url));

// YouTrack serves widget assets from its own origin; the crossorigin attribute breaks loading.
const dropCrossoriginAttributePlugin = (): Plugin => ({
  name: 'no-crossorigin-attribute',
  transformIndexHtml(html: string) {
    return html.replaceAll('crossorigin', '');
  }
});

// Upload dist/ to the YouTrack instance from .env after every successful build (used by `npm run watch`).
const uploadOnBuild = (): Plugin => ({
  name: 'youtrack-upload-on-build',
  apply: 'build',
  closeBundle() {
    if (process.env.AUTOUPLOAD !== 'true') {
      return;
    }
    const result = spawnSync('npm', ['run', 'upload-local'], {stdio: 'inherit'});
    if (result.status !== 0) {
      console.error('[upload-on-build] upload failed');
    }
  }
});

export default defineConfig({
  optimizeDeps: {
    exclude: ['@jetbrains/youtrack-apps-tools']
  },
  ssr: {
    noExternal: [],
    external: ['@jetbrains/youtrack-apps-tools']
  },
  plugins: [
    // Discover widget entry points from src/widgets/*/index.html
    youtrackWidgetEntries(),
    // Fast Refresh doesn't work in the YouTrack iframe, so only use the React plugin for builds
    ...(!isServing ? [react()] : []),
    dropCrossoriginAttributePlugin(),
    youtrackDevHtml({
      enabled: process.env.DEV_MODE === 'true',
      devServerPort: 9000
    }),
    uploadOnBuild(),
    viteStaticCopy({
      targets: [
        {src: '../manifest.json', dest: '.'},
        {src: '../public/*.*', dest: '.'}
      ]
    }),
    viteStaticCopy({
      targets: [
        // Widget icons
        {src: 'widgets/*/*.{svg,png,jpg,json}', dest: '.'}
      ],
      structured: true,
      silent: true
    })
  ],
  resolve: {
    alias: {
      '@': resolve(currentDir, 'src')
    }
  },
  server: {
    port: 9000,
    cors: {
      origin: '*',
      credentials: true
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  },
  root: './src',
  base: '',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    copyPublicDir: false,
    target: ['es2022'],
    assetsDir: 'widgets/assets',
    minify: true,
    rollupOptions: {
      external: ['@jetbrains/youtrack-apps-tools']
    }
  }
});
