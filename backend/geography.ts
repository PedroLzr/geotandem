import { geoContains } from 'd3-geo';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import world from '../data/location-map.json';
import countries from '../data/countries.json';
import type { Coordinates } from '../shared/types';

const features = (world as FeatureCollection<Polygon | MultiPolygon>).features;
export const locationCountries = countries;
const territories = new Map(features.map((f) => [String(f.id), f]));
for (const country of locationCountries) {
  if (!territories.has(country.numeric))
    throw new Error(`Missing location geometry: ${country.code}`);
}
export function isInsideCountry(code: string, point: Coordinates | null): boolean {
  const country = locationCountries.find((c) => c.code === code);
  if (!country) throw new Error('Unsupported location country.');
  const territory = territories.get(country.numeric)!;
  return point !== null && geoContains(territory, point);
}
