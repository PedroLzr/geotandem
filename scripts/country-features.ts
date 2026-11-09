import { readFileSync } from 'node:fs';
import supplements from '../data/geometry-supplements.json';
import { feature, merge } from 'topojson-client';
import { geoCentroid, geoContains } from 'd3-geo';
import type {
  Topology,
  GeometryCollection,
  Polygon as TopoPolygon,
  MultiPolygon as TopoMultiPolygon,
} from 'topojson-specification';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';

// The game treats Morocco and the whole of Western Sahara as separate countries.
// world-atlas uses a control line within Western Sahara. Remove that line by
// merging the two source territories, then restore the border at 27°40′ N.
// Reference: https://www.un.org/geospatial/sites/www.un.org.geospatial/files/files/documents/2023/Sep/western_sahara_3175_r4_oct12_120.pdf
const BORDER_LATITUDE = 27 + 40 / 60;

function clipRing(ring: Position[], north: boolean): Position[] {
  const inside = (p: Position) => (north ? p[1] >= BORDER_LATITUDE : p[1] <= BORDER_LATITUDE);
  const result: Position[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1];
    if (inside(a)) result.push(a);
    if (inside(a) !== inside(b)) {
      const fraction = (BORDER_LATITUDE - a[1]) / (b[1] - a[1]);
      result.push([a[0] + fraction * (b[0] - a[0]), BORDER_LATITUDE]);
    }
  }
  if (result.length < 3) return [];
  // D3 joins vertices with great-circle arcs. Subdivide the parallel so the
  // visible and scored border stays at this latitude instead of bowing north.
  const dense: Position[] = [];
  for (let i = 0; i < result.length; i++) {
    const a = result[i],
      b = result[(i + 1) % result.length];
    dense.push(a);
    if (a[1] === BORDER_LATITUDE && b[1] === BORDER_LATITUDE) {
      const steps = Math.ceil(Math.abs(b[0] - a[0]) / 0.1);
      for (let j = 1; j < steps; j++) {
        dense.push([a[0] + ((b[0] - a[0]) * j) / steps, BORDER_LATITUDE]);
      }
    }
  }
  dense.push(dense[0]);
  return dense;
}

export function countryFeatures(
  resolution: '50m' | '110m' = '50m',
): Feature<Polygon | MultiPolygon>[] {
  const topology = JSON.parse(
    readFileSync(`node_modules/world-atlas/countries-${resolution}.json`, 'utf8'),
  ) as Topology<{ countries: GeometryCollection }>;
  const features = feature(topology, topology.objects.countries).features as Feature<
    Polygon | MultiPolygon
  >[];
  const territories = topology.objects.countries.geometries.filter(
    (g): g is TopoPolygon | TopoMultiPolygon =>
      (g.type === 'Polygon' || g.type === 'MultiPolygon') && ['504', '732'].includes(String(g.id)),
  );
  if (territories.length !== 2) throw new Error('Missing Morocco or Western Sahara geometry');
  const combined = merge(topology, territories);
  for (const [id, north] of [
    ['504', true],
    ['732', false],
  ] as const) {
    const polygons = combined.coordinates.flatMap((polygon) => {
      const outer = clipRing(polygon[0], north);
      if (!outer.length) return [];
      return [
        [
          outer,
          ...polygon
            .slice(1)
            .map((ring) => clipRing(ring, north))
            .filter((ring) => ring.length),
        ],
      ];
    });
    if (!polygons.length) throw new Error(`Empty country geometry: ${id}`);
    features.find((f) => String(f.id) === id)!.geometry = {
      type: 'MultiPolygon',
      coordinates: polygons,
    };
  }
  // Kosovo has no ISO numeric code in world-atlas. Keep a stable, explicit ID.
  const kosovo = features.find((f) => f.properties?.name === 'Kosovo');
  if (kosovo) kosovo.id = 'XKX';
  for (const supplement of supplements.features) {
    const index = features.findIndex((f) => String(f.id) === supplement.id);
    const detailed = structuredClone(supplement) as Feature<Polygon | MultiPolygon>;
    if (index < 0) features.push(detailed);
    else features[index] = detailed;
  }
  // The base map does not cut Vatican City out of Italy. Preserve the enclave
  // as a hole, so a Vatican location cannot also score as Italian territory.
  const italy = features.find((f) => String(f.id) === '380');
  const vatican = features.find((f) => String(f.id) === '336');
  if (italy && vatican) {
    const hostPolygons =
      italy.geometry.type === 'Polygon' ? [italy.geometry.coordinates] : italy.geometry.coordinates;
    const enclavePolygons =
      vatican.geometry.type === 'Polygon'
        ? [vatican.geometry.coordinates]
        : vatican.geometry.coordinates;
    for (const coordinates of enclavePolygons) {
      const center = geoCentroid({ type: 'Polygon', coordinates });
      const host = hostPolygons.find((coordinates) =>
        geoContains({ type: 'Polygon', coordinates }, center),
      );
      if (host) host.push([...coordinates[0]].reverse());
    }
  }
  // Some countries have multiple source records (Australia and Ashmore/Cartier).
  // Combine every part under one ID, so drawing and scoring use the whole country.
  const grouped = new Map<string, Feature<Polygon | MultiPolygon>>();
  const result: Feature<Polygon | MultiPolygon>[] = [];
  for (const f of features) {
    const id = f.id === undefined ? undefined : String(f.id);
    const existing = id === undefined ? undefined : grouped.get(id);
    if (!existing) {
      result.push(f);
      if (id !== undefined) grouped.set(id, f);
    } else {
      const polygons = (g: Polygon | MultiPolygon) =>
        g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      existing.geometry = {
        type: 'MultiPolygon',
        coordinates: [...polygons(existing.geometry), ...polygons(f.geometry)],
      };
    }
  }
  return result;
}
