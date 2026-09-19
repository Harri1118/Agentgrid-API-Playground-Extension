import { build } from 'esbuild'

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: 'dist/extension.js',
})

console.log('dist/extension.js built')
