import { countryFeatures } from './country-features';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { countrySilhouette } from './silhouette';
import countries from '../data/countries.json';
const features = countryFeatures();
const assets: Record<string, { shape: string; flag: string }> = {};
for (const country of countries) {
  const geometry = features.find((f) => String(f.id) === country.numeric);
  if (!geometry) throw new Error(`Missing geometry: ${country.code}`);
  let flag = readFileSync(
    `node_modules/flag-icons/flags/4x3/${country.code.toLowerCase()}.svg`,
    'utf8',
  );
  flag = flag
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  // Library IDs contain ISO codes; neutral IDs preserve SVG references without answer hints.
  const ids = new Map<string, string>();
  flag = flag.replace(/\bid="([^"]+)"/g, (_match, id: string) => {
    const neutral = `visual-${ids.size}`;
    ids.set(id, neutral);
    return `id="${neutral}"`;
  });
  flag = flag.replace(/#([A-Za-z][\w:.-]*)/g, (match, id: string) =>
    ids.has(id) ? `#${ids.get(id)}` : match,
  );
  assets[country.code] = {
    shape: countrySilhouette(geometry),
    flag,
  };
}
writeFileSync('data/assets.json', JSON.stringify(assets));
mkdirSync('licenses', { recursive: true });
for (const name of ['flag-icons', 'world-atlas', 'topojson-client', 'd3-geo']) {
  copyFileSync(`node_modules/${name}/LICENSE`, `licenses/${name}.txt`);
}
console.log(`Bundled shapes and flags for ${countries.length} countries.`);
