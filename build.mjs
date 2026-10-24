// ENKAZ derleme betigi: src/ -> dist/index.html (tek dosya, her sey gomulu)
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');

async function build() {
  const t0 = Date.now();
  const worker = await esbuild.build({
    entryPoints: ['src/world/mesher.worker.js'],
    bundle: true, format: 'iife', minify: !dev, write: false, target: 'es2022',
    legalComments: 'none',
  });
  const workerCode = worker.outputFiles[0].text;

  const main = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true, format: 'iife', minify: !dev, write: false, target: 'es2022',
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    define: {
      __WORKER_CODE__: JSON.stringify(workerCode),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  });
  const js = main.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  let html = fs.readFileSync('src/index.html', 'utf8');
  html = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);
  // GitHub Pages: ayni tek dosya docs/ altina (Pages kaynagi: main /docs)
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/index.html', html);
  fs.writeFileSync('docs/.nojekyll', '');
  const kb = (fs.statSync('dist/index.html').size / 1024).toFixed(0);
  console.log(`dist/index.html ${kb} KB (${Date.now() - t0} ms)`);
}

build().catch((e) => { console.error(e); process.exit(1); });
