import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
const topology = JSON.parse(
  readFileSync('node_modules/world-atlas/countries-110m.json', 'utf8'),
) as Topology<{ countries: GeometryCollection }>;
const projection = geoOrthographic().rotate([-12, -20]).translate([240, 240]).scale(208);
const path = geoPath(projection);
writeFileSync(
  'frontend/public/globe.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><circle cx="240" cy="240" r="232" fill="none" stroke="#c6d1bc" stroke-dasharray="2 8"/><circle cx="240" cy="240" r="208" fill="#e5eadb" stroke="#b8c5ae"/><path d="${path(geoGraticule10())}" fill="none" stroke="#c7d1bd" stroke-width=".7"/><path d="${path(feature(topology, topology.objects.countries))}" fill="#59785e" stroke="#e5eadb" stroke-width=".65"/><ellipse cx="240" cy="240" rx="226" ry="76" transform="rotate(-28 240 240)" fill="none" stroke="#b36b42" stroke-width="1.4" stroke-dasharray="5 5"/><circle cx="429" cy="130" r="7" fill="#c5794b" stroke="#faf8f1" stroke-width="4"/></svg>`,
);
