import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoArea } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import countries from '../data/countries.json';

const topology = JSON.parse(
  readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'),
) as Topology<{ countries: GeometryCollection }>;
const features = feature(topology, topology.objects.countries).features as Feature<
  Polygon | MultiPolygon
>[];
const seen = new Set<string>();
for (const [index, f] of features.entries()) {
  const country = countries.find((c) => c.numeric === String(f.id).padStart(3, '0'));
  f.properties = {};
  const id = String(f.id).padStart(3, '0');
  f.id = f.id === undefined || seen.has(id) ? `map-${index}` : id;
  seen.add(id);
  // Match the territory choices used by build-data.ts for the silhouettes.
  if (country && f.geometry.type === 'MultiPolygon') {
    const polygons = f.geometry.coordinates
      .map((coordinates) => ({ coordinates, area: geoArea({ type: 'Polygon', coordinates }) }))
      .sort((a, b) => b.area - a.area);
    f.geometry.coordinates = (
      ['PT', 'ES', 'EC'].includes(country.code)
        ? polygons.slice(0, 1)
        : polygons.filter((p) => p.area >= polygons[0].area * 0.005)
    ).map((p) => p.coordinates);
  }
}
// Rounding is shared by rendering and scoring, so the visible border is the scored border.
writeFileSync(
  'data/location-map.json',
  JSON.stringify({ type: 'FeatureCollection', features }, (_key, value) =>
    typeof value === 'number' ? Math.round(value * 10000) / 10000 : value,
  ),
);
console.log(`Bundled ${features.length} territories for location rounds.`);
