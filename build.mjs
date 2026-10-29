// FragRush derleme betigi: src/ -> tek dosya index.html (her sey gomulu)
//   node build.mjs                      -> dist/index.html + docs/index.html (GitHub Pages)
//   node build.mjs --portal crazygames  -> CrazyGames surumu: ../FragRush-CrazyGames/build/index.html
//                                          (analitik yok, CrazyGames SDK, oyun ici tam ekran istegi yok)
//   --out <klasor>  portal ciktisinin klasoru
//   --no-docs       docs/ (GitHub Pages kaynagi) yazilmasin: dal uzerinde test derlemesi
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dev = argv.includes('--dev');
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const portal = arg('--portal') || '';
if (portal && portal !== 'crazygames') { console.error('bilinmeyen portal: ' + portal); process.exit(1); }
const outDir = arg('--out') || (portal ? path.resolve('..', 'FragRush-CrazyGames', 'build') : null);

const SDK_TAG = {
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
};

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
    // portal: ag kodu hic pakete girmesin (net/index.js -> stub.js)
    plugins: portal ? [{ name: 'no-net', setup(b) { b.onResolve({ filter: /\/net\/index\.js$/ }, () => ({ path: path.resolve('src/net/stub.js') })); } }] : [],
    define: {
      __WORKER_CODE__: JSON.stringify(workerCode),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __PORTAL__: JSON.stringify(portal),
      __NET__: JSON.stringify(!portal),     // CrazyGames surumunde ag kodu ve dugme pakete girmez
    },
  });
  const js = main.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  let html = fs.readFileSync('src/index.html', 'utf8');
  html = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  html = html.replace('<!--__HEAD__-->', () => (portal ? SDK_TAG[portal] : ''));
  // portal surumunde ziyaret sayaci (GoatCounter) yok
  if (portal) html = html.replace(/<!--ANALYTICS-->[\s\S]*?<!--\/ANALYTICS-->/, '');
  else html = html.replace('<!--ANALYTICS-->', '').replace('<!--/ANALYTICS-->', '');
  // ucuncu parti lisans bildirimleri (three.js MIT, postprocessing Zlib, n8ao) derlenmis dosyada da dursun
  const notices = fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8').replace(/--/g, '- -');
  html = html.replace('</html>', () => '<!--\nFragRush (c) 2026 Eren Çıracıoğlu. Code: PolyForm Noncommercial 1.0.0. All other rights reserved.\n\n' + notices + '\n-->\n</html>');

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
  if (portal) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    console.log(`${portal}: ${path.join(outDir, 'index.html')} ${kb(html)} KB (${Date.now() - t0} ms)`);
    return;
  }
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', html);
  // GitHub Pages: ayni tek dosya docs/ altina (Pages kaynagi: main /docs)
  if (!argv.includes('--no-docs')) {
    fs.mkdirSync('docs', { recursive: true });
    fs.writeFileSync('docs/index.html', html);
    fs.writeFileSync('docs/.nojekyll', '');
  }
  console.log(`dist/index.html ${kb(html)} KB (${Date.now() - t0} ms)`);
}

build().catch((e) => { console.error(e); process.exit(1); });
