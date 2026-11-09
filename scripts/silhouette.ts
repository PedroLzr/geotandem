import { geoArea, geoCentroid, geoMercator, geoPath } from 'd3-geo';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

type CountryFeature = Feature<Polygon | MultiPolygon>;
const opening = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">';
function outline(f: CountryFeature, extent: [[number, number], [number, number]]) {
  const projection = geoMercator()
    .rotate([-geoCentroid(f)[0], 0])
    .fitExtent(extent, f);
  const path = geoPath(projection);
  const d = path(f);
  if (!d || /NaN|Infinity/.test(d)) throw new Error(`Invalid silhouette: ${f.id}`);
  return {
    area: path.area(f),
    svg: `<path fill="#205c49" stroke="#205c49" stroke-width="0.6" stroke-linejoin="round" d="${d}"/>`,
  };
}

export function countrySilhouette(f: CountryFeature): string {
  const full = outline(f, [
    [25, 15],
    [455, 305],
  ]);
  if (f.geometry.type === 'Polygon' || full.area >= 6000) return `${opening}${full.svg}</svg>`;
  // Widely separated islands must remain in the full-country view. Add an
  // enlarged view of the main landmasses instead of excluding their country.
  const polygons = f.geometry.coordinates
    .map((coordinates) => ({
      coordinates,
      area: geoArea({ type: 'Polygon', coordinates }),
    }))
    .sort((a, b) => b.area - a.area);
  const largest = polygons[0];
  const detail: CountryFeature = {
    ...f,
    geometry: {
      type: 'MultiPolygon',
      coordinates: polygons.filter((p) => p.area >= largest.area * 0.2).map((p) => p.coordinates),
    },
  };
  // If those islands are still too spread out, enlarge the largest one.
  let enlarged = outline(detail, [
    [20, 45],
    [300, 300],
  ]);
  if (enlarged.area < 2500)
    enlarged = outline({ ...f, geometry: { type: 'Polygon', coordinates: largest.coordinates } }, [
      [20, 45],
      [300, 300],
    ]);
  const overview = outline(f, [
    [325, 65],
    [465, 280],
  ]);
  return `${opening}<text x="160" y="25" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#536356">Enlarged detail</text><text x="395" y="45" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#536356">Full country</text><path d="M315 45V300" stroke="#d8dfd2"/>${enlarged.svg}${overview.svg}</svg>`;
}
