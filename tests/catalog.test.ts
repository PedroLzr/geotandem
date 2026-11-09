import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import countries from '../data/countries.json';
import assetsJson from '../data/assets.json';
import world from '../data/location-map.json';
import { locationCountries, isInsideCountry } from '../backend/geography';
import { questionForCountry, generateQuestions } from '../backend/questions';
import { countryFeatures } from '../scripts/country-features';
import type { Coordinates } from '../shared/types';

// 193 UN members, two observer states, plus EH, XK, TW, CK and NU.
const expectedCodes =
  `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS EH XK TW CK NU`
    .split(' ')
    .sort();
const features = world.features as Feature<Polygon | MultiPolygon>[];
const assets: Record<string, { shape: string; flag: string }> = assetsJson;

function interiorPoint(f: Feature<Polygon | MultiPolygon>): Coordinates {
  const polygons = (
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  )
    .map((coordinates) => ({ type: 'Polygon' as const, coordinates }))
    .sort((a, b) => geoArea(b) - geoArea(a));
  for (const polygon of polygons) {
    const center = geoCentroid(polygon) as Coordinates;
    if (geoContains(f, center)) return center;
    const ring = polygon.coordinates[0];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i];
      if (Math.abs(a[0] - b[0]) > 180) continue;
      for (const delta of [0.000001, -0.000001, 0.00001, -0.00001]) {
        const point: Coordinates = [(a[0] + b[0]) / 2 + delta, (a[1] + b[1]) / 2 + delta];
        if (geoContains(f, point)) return point;
      }
    }
  }
  throw new Error(`No playable interior for ${f.id}`);
}

test('all 200 countries belong to every phase, without eligibility exclusions', () => {
  assert.equal(expectedCodes.length, 200);
  assert.deepEqual(countries.map((c) => c.code).sort(), expectedCodes);
  assert.deepEqual(locationCountries.map((c) => c.code).sort(), expectedCodes);
  assert.equal(new Set(countries.map((c) => c.numeric)).size, 200);
  assert.equal(new Set(countries.map((c) => c.name)).size, 200);
  assert.deepEqual(Object.keys(assets).sort(), expectedCodes);
  for (const country of countries) {
    assert.ok(country.capital.trim());
    for (const phase of [0, 1, 2, 3] as const) {
      const question = questionForCountry(country, phase);
      assert.equal(question.country, country.code);
      if (phase === 3) {
        assert.equal(question.kind, 'location');
        assert.equal(question.prompt, `Locate ${country.name}`);
      } else {
        assert.equal(question.options.length, 6);
        assert.equal(new Set(question.options.map((o) => o.text)).size, 6);
        assert.equal(
          question.options.find((o) => o.id === question.correctOptionId)!.text,
          phase === 2 ? country.capital : country.name,
        );
        if (phase === 2) {
          assert.equal(question.prompt, country.capitalQuestion);
          assert.equal(question.visual, undefined);
        } else {
          const svg = Buffer.from(question.visual!.split(',')[1], 'base64').toString();
          assert.ok(svg.includes('<svg'), country.code);
          assert.ok(!/NaN|Infinity/.test(svg), country.code);
          assert.ok(svg.includes('<path'), country.code);
        }
      }
    }
  }
});

test('all 200 countries have a nonempty scored interior, including microstates and atolls', () => {
  for (const country of countries) {
    const matching = features.filter((f) => f.id === country.numeric);
    assert.equal(matching.length, 1, country.code);
    const area = geoArea(matching[0]);
    assert.ok(area > 0 && area < 2 * Math.PI, country.code);
    assert.equal(isInsideCountry(country.code, interiorPoint(matching[0])), true, country.code);
    assert.equal(isInsideCountry(country.code, null), false);
  }
});

test('regeneration preserves every source polygon and uses identical geometry for location scoring', () => {
  const sources = countryFeatures();
  for (const country of countries) {
    const source = sources.find((f) => f.id === country.numeric)!;
    assert.ok(source, country.code);
    const rounded = JSON.parse(
      JSON.stringify(source.geometry, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
      ),
    );
    assert.deepEqual(
      features.find((f) => f.id === country.numeric)!.geometry,
      rounded,
      country.code,
    );
  }
  for (const [code, point] of [
    ['ES', [-16.5, 28.3]], // Tenerife
    ['PT', [-25.5, 37.8]], // Azores
    ['EC', [-90.4, -0.6]], // Galapagos
    ['US', [-155.5, 19.6]], // Hawaii
    ['FR', [-53, 4]], // French Guiana
  ] as [string, Coordinates][])
    assert.equal(isInsideCountry(code, point), true, code);
});

test('all phases retain ten distinct random targets and unambiguous capital prompts', () => {
  const phases = generateQuestions();
  assert.equal(phases.length, 4);
  for (const questions of phases) {
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions.map((q) => q.country)).size, 10);
  }
  for (const [code, phrase, answer] of [
    ['CH', 'federal city', 'Bern'],
    ['MY', 'official capital', 'Kuala Lumpur'],
    ['ZA', 'administrative capital', 'Pretoria'],
    ['SZ', 'administrative capital', 'Mbabane'],
    ['NR', 'seat of government', 'Yaren'],
    ['LK', 'legislative capital', 'Sri Jayewardenepura Kotte'],
    ['BO', 'constitutional capital', 'Sucre'],
    ['PS', 'declared capital', 'East Jerusalem'],
    ['GQ', 'capital', 'Ciudad de la Paz'],
    ['PW', 'capital', 'Ngerulmud'],
  ]) {
    const country = countries.find((c) => c.code === code)!;
    const q = questionForCountry(country, 2);
    assert.ok(q.prompt.includes(phrase));
    assert.equal(q.options.find((o) => o.id === q.correctOptionId)!.text, answer);
  }
});

test('Vatican City and Monaco use detailed microstate boundaries rather than cartographic placeholders', () => {
  assert.equal(isInsideCountry('VA', [12.4529, 41.9034]), true);
  assert.equal(isInsideCountry('IT', [12.4529, 41.9034]), false);
  for (const [id, min, max] of [
    ['336', 0.4, 0.6],
    ['492', 1.8, 2.3],
  ] as const) {
    const f = features.find((f) => f.id === id)!;
    const areaKm2 = geoArea(f) * 6371 ** 2;
    assert.ok(areaKm2 > min && areaKm2 < max, `${id}: ${areaKm2} km²`);
  }
});
