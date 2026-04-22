const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, 'src/vapi-entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: path.join(__dirname, 'public/vendor/vapi.bundle.js'),
}).then(() => {
  console.log('Vapi bundle built');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
