import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoMercator, geoPath, geoArea, geoCentroid } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countries from '../data/countries.json';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
const topology = JSON.parse(
  readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'),
) as Topology<{ countries: GeometryCollection }>;
const features = feature(topology, topology.objects.countries).features;
const assets: Record<string, { shape: string; flag: string }> = {};
for (const country of countries) {
  const source = features.find((f) => String(f.id).padStart(3, '0') === country.numeric);
  const geometry = source
    ? (structuredClone(source) as Feature<Polygon | MultiPolygon>)
    : undefined;
  if (geometry?.geometry.type === 'MultiPolygon') {
    const polygons = geometry.geometry.coordinates
      .map((coordinates) => ({ coordinates, area: geoArea({ type: 'Polygon', coordinates }) }))
      .sort((a, b) => b.area - a.area);
    // Continental silhouettes avoid remote islands shrinking recognizable mainland outlines.
    const continentalOnly = ['PT', 'ES', 'EC'].includes(country.code);
    geometry.geometry.coordinates = (
      continentalOnly
        ? polygons.slice(0, 1)
        : polygons.filter((p) => p.area >= polygons[0].area * 0.005)
    ).map((p) => p.coordinates);
  }
  if (!geometry && country.shapeEligible) throw new Error(`Missing geometry: ${country.code}`);
  // Center the projection's seam opposite the country, including date-line archipelagos.
  const projection = geoMercator().rotate([geometry ? -geoCentroid(geometry)[0] : 0, 0]);
  const path = geometry
    ? geoPath(
        projection.fitExtent(
          [
            [25, 15],
            [455, 305],
          ],
          geometry,
        ),
      )(geometry)
    : '';
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
    shape: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"><path fill="#205c49" d="${path}"/></svg>`,
    flag,
  };
}
writeFileSync('data/assets.json', JSON.stringify(assets));
mkdirSync('licenses', { recursive: true });
for (const name of ['flag-icons', 'world-atlas', 'topojson-client', 'd3-geo']) {
  copyFileSync(`node_modules/${name}/LICENSE`, `licenses/${name}.txt`);
}
console.log(`Bundled shapes and flags for ${countries.length} countries.`);
