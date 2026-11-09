import { countryFeatures } from './country-features';
import { writeFileSync } from 'node:fs';
import countries from '../data/countries.json';

const features = countryFeatures();
const seen = new Set<string>();
for (const [index, f] of features.entries()) {
  f.properties = {};
  const id = String(f.id).padStart(3, '0');
  f.id = f.id === undefined || seen.has(id) ? `map-${index}` : id;
  seen.add(id);
}
for (const country of countries) {
  if (!features.some((f) => f.id === country.numeric))
    throw new Error(`Missing location geometry: ${country.code}`);
}
// Rounding is shared by rendering and scoring, so the visible border is the scored border.
writeFileSync(
  'data/location-map.json',
  JSON.stringify({ type: 'FeatureCollection', features }, (_key, value) =>
    typeof value === 'number' ? Math.round(value * 1000000) / 1000000 : value,
  ),
);
console.log(`Bundled ${features.length} territories for location rounds.`);
