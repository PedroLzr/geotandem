import { geoContains } from 'd3-geo';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import world from '../data/location-map.json';
import countries from '../data/countries.json';
import type { Coordinates } from '../shared/types';

const features = (world as FeatureCollection<Polygon | MultiPolygon>).features;
export const locationCountries = countries.filter(
  (c) => c.shapeEligible && features.some((f) => f.id === c.numeric),
);
export function isInsideCountry(code: string, point: Coordinates | null): boolean {
  const country = locationCountries.find((c) => c.code === code);
  if (!country) throw new Error('Unsupported location country.');
  const territory = features.find((f) => f.id === country.numeric)!;
  return point !== null && geoContains(territory, point);
}
