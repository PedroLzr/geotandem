import { test } from 'node:test';
import { GameEngine } from '../backend/engine';
import { INTRO_MS } from '../shared/types';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { geoArea, geoContains, geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { countryFeatures } from '../scripts/country-features';
import { isInsideCountry, locationCountries } from '../backend/geography';
import countries from '../data/countries.json';
import assets from '../data/assets.json';
import world from '../data/location-map.json';
import supplements from '../data/geometry-supplements.json';
import type { Coordinates } from '../shared/types';

const saharanPoints: Coordinates[] = [
  [-13.2, 27.15], // Laayoune: west of the provider's former control line
  [-15.94, 23.71], // Dakhla
  [-10.57, 26.16], // Tifariti: east of the former control line
  [-9.57, 26.35], // Bir Lehlou
  [-12, 27.65], // Just south of the national boundary
];
const moroccanPoints: Coordinates[] = [
  [-6.84, 34.02],
  [-7.98, 31.63],
  [-12, 27.68],
];

test('Western Sahara is eligible in all four phases with its own identity, capital and flag', () => {
  const country = countries.find((c) => c.code === 'EH')!;
  assert.deepEqual(country, {
    code: 'EH',
    alpha3: 'ESH',
    numeric: '732',
    name: 'Western Sahara',
    capital: 'Laayoune',
    region: 'Africa',
    capitalQuestion: 'What is the claimed capital of Western Sahara?',
  });
  assert.ok(locationCountries.some((c) => c.code === 'EH'));
  assert.ok(assets.EH.flag.includes('<svg'));
  assert.notEqual(assets.EH.flag, assets.MA.flag);
  assert.notEqual(assets.EH.shape, assets.MA.shape);
});

test('location scoring separates all of Western Sahara from Morocco', () => {
  for (const point of saharanPoints) {
    assert.equal(isInsideCountry('EH', point), true, `EH: ${point}`);
    assert.equal(isInsideCountry('MA', point), false, `MA: ${point}`);
  }
  for (const point of moroccanPoints) {
    assert.equal(isInsideCountry('MA', point), true, `MA: ${point}`);
    assert.equal(isInsideCountry('EH', point), false, `EH: ${point}`);
  }
  for (const point of [
    [-8, 25],
    [-15, 19],
    [-20, 25],
  ] as Coordinates[]) {
    assert.equal(isInsideCountry('EH', point), false);
    assert.equal(isInsideCountry('MA', point), false);
  }
});

for (const resolution of ['50m', '110m'] as const) {
  test(`${resolution} regeneration removes the control line without losing land or changing other countries`, () => {
    const corrected = countryFeatures(resolution);
    const topology = JSON.parse(
      readFileSync(`node_modules/world-atlas/countries-${resolution}.json`, 'utf8'),
    );
    const typedTopology = topology as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const original = feature(typedTopology, typedTopology.objects.countries);
    assert.equal(original.type, 'FeatureCollection');
    if (original.type !== 'FeatureCollection') throw new Error('Expected countries');
    const ma = corrected.find((f) => f.id === '504')!;
    const eh = corrected.find((f) => f.id === '732')!;
    for (const point of saharanPoints) {
      assert.equal(geoContains(eh, point), true);
      assert.equal(geoContains(ma, point), false);
    }
    for (const point of moroccanPoints) {
      assert.equal(geoContains(ma, point), true);
      assert.equal(geoContains(eh, point), false);
    }
    const previousArea = original.features
      .filter((f) => ['504', '732'].includes(String(f.id)))
      .reduce((sum, f) => sum + geoArea(f), 0);
    assert.ok(Math.abs(geoArea(ma) + geoArea(eh) - previousArea) < 0.000001);
    assert.deepEqual(
      corrected.filter(
        (f) =>
          !['504', '732', '036', '380', 'XKX', ...supplements.features.map((f) => f.id)].includes(
            String(f.id),
          ),
      ),
      original.features.filter(
        (f) =>
          !['504', '732', '036', '380', ...supplements.features.map((f) => f.id)].includes(
            String(f.id),
          ) && f.properties?.name !== 'Kosovo',
      ),
    );
  });
}

test('bundled silhouettes and location map use the corrected source geometry', () => {
  const features = countryFeatures();
  for (const [code, id] of [
    ['MA', '504'],
    ['EH', '732'],
  ] as const) {
    const f = features.find((f) => f.id === id)!;
    const projection = geoMercator()
      .rotate([-geoCentroid(f)[0], 0])
      .fitExtent(
        [
          [25, 15],
          [455, 305],
        ],
        f,
      );
    assert.equal(
      assets[code].shape,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"><path fill="#205c49" stroke="#205c49" stroke-width="0.6" stroke-linejoin="round" d="${geoPath(projection)(f)}"/></svg>`,
    );
    const rounded = JSON.parse(
      JSON.stringify(f.geometry, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 1000000) / 1000000 : value,
      ),
    );
    assert.deepEqual(world.features.find((f) => f.id === id)!.geometry, rounded);
  }
});

for (const mode of ['solo', 'duel', 'arena'] as const) {
  test(`${mode} scores Western Sahara independently and reveals its own territory`, () => {
    let now = 100_000;
    const engine = new GameEngine(() => now);
    const host = engine.connect('Host');
    engine.create(host.id, mode);
    const players = [host];
    if (mode !== 'solo') {
      const guest = engine.connect('Guest');
      engine.join(guest.id, host.roomId!);
      players.push(guest);
      engine.start(host.id);
    }
    const room = engine.roomFor(host.id);
    room.phase = 3;
    const question = room.questions[3][0];
    question.country = 'EH';
    question.prompt = 'Locate Western Sahara';
    now += INTRO_MS;
    engine.tick();
    engine.locate(host.id, question.id, [-13.2, 27.15], true);
    if (players[1]) engine.locate(players[1].id, question.id, [-6.84, 34.02], true);
    assert.equal(room.locationReveal!.countryId, '732');
    assert.equal(host.answers[0].correct, true);
    if (players[1]) assert.equal(players[1].answers[0].correct, false);
  });
}
