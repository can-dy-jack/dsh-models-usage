/**
 * Build: src/ → lib/*.js (esbuild, bundled).
 *
 * Two targets with different platforms:
 *   - src/index.ts  → lib/index.js   (Host half, Node ESM; @deepseek-ai/*
 *                                    imports stay external for the runtime
 *                                    linked-layer resolver)
 *   - src/client.ts → lib/client.js  (browser half, iife: the host serves it
 *                                    as a plain *script* to
 *                                    window.__ModuleLoader__, so no
 *                                    import/export may survive)
 *
 * Usage: node tools/build.mjs [--watch]
 */
import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

const shared = {
  bundle: true,
  target: 'es2022',
  sourcemap: false,
  logLevel: 'info',
}

const builds = [
  {
    ...shared,
    entryPoints: ['src/index.ts'],
    outfile: 'lib/index.js',
    platform: 'node',
    format: 'esm',
    external: ['@deepseek-ai/*'],
  },
  {
    ...shared,
    entryPoints: ['src/client.tsx'],
    outfile: 'lib/client.js',
    platform: 'browser',
    format: 'iife',
    // Classic JSX transform: emits React.createElement/React.Fragment onto the
    // shared-React binding from src/client/react.ts (no react package needed).
    jsx: 'transform',
  },
]

if (watch) {
  const contexts = await Promise.all(builds.map((options) => context(options)))
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  console.log('[build] watching src/ → lib/*.js')
} else {
  await Promise.all(builds.map((options) => build(options)))
}
