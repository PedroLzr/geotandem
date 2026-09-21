import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../backend/engine';
import { isInsideCountry } from '../backend/geography';
import { INTRO_MS, LOCATION_MS, LOCATION_REVEAL_MS, type Coordinates } from '../shared/types';
import world from '../data/location-map.json';

function setup() {
  let now = 100_000;
  const engine = new GameEngine(() => now);
  const a = engine.connect('Alex'),
    b = engine.connect('Sam');
  engine.create(a.id);
  engine.join(b.id, a.roomId!);
  engine.start(a.id);
  const room = engine.roomFor(a.id);
  room.phase = 3;
  room.questions[3][0].country = 'ES';
  room.questions[3][0].prompt = 'Locate Spain';
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  advance(INTRO_MS);
  const question = () => room.questions[3][a.index];
  return {
    engine,
    a,
    b,
    room,
    advance,
    question,
    setTime: (value: number) => {
      now = value;
    },
  };
}

test('each player scores independently, and nearby points outside the country always fail', () => {
  const madrid: Coordinates = [-3.7, 40.4];
  const coruna: Coordinates = [-8.4, 43.36];
  const murcia: Coordinates = [-1.13, 37.99];
  const lisbon: Coordinates = [-9.14, 38.72];
  const toulouse: Coordinates = [1.44, 43.6];
  for (const [points, expected] of [
    [
      [madrid, madrid],
      [true, true],
    ],
    [
      [coruna, murcia],
      [true, true],
    ],
    [
      [madrid, lisbon],
      [true, false],
    ],
    [
      [toulouse, madrid],
      [false, true],
    ],
    [
      [lisbon, toulouse],
      [false, false],
    ],
    [
      [null, madrid],
      [false, true],
    ],
    [
      [madrid, null],
      [true, false],
    ],
    [
      [null, null],
      [false, false],
    ],
  ] as [(Coordinates | null)[], boolean[]][]) {
    const { engine, a, b, room, advance, question } = setup();
    for (const [i, player] of [a, b].entries()) {
      if (points[i]) engine.locate(player.id, question().id, points[i]!, true);
    }
    if (points.includes(null)) advance(LOCATION_MS);
    assert.deepEqual(
      room.locationReveal!.guesses.map((g) => g.correct),
      expected,
    );
    assert.deepEqual([a.answers[0].correct, b.answers[0].correct], expected);
    assert.ok(room.locationReveal!.guesses.every((g) => !('distanceKm' in g)));
  }
});

test('containment handles mainland, islands and the date line using the displayed geometry', () => {
  assert.equal(isInsideCountry('ES', [-3.7, 40.4]), true);
  assert.equal(isInsideCountry('AU', [133, -25]), true);
  assert.equal(isInsideCountry('AU', [146.6, -42]), true);
  assert.equal(isInsideCountry('JP', [139.7, 35.7]), true);
  assert.equal(isInsideCountry('ES', [2.35, 48.85]), false);
  assert.equal(isInsideCountry('ES', [0, 0]), false);
  assert.equal(isInsideCountry('NZ', [180, -40]), isInsideCountry('NZ', [-180, -40]));
  assert.equal(new Set(world.features.map((f) => f.id)).size, world.features.length);
});

test('drafts persist across reconnects and auto-confirm at deadline without leaking to the rival', () => {
  const { engine, a, b, room, advance, question } = setup();
  engine.locate(a.id, question().id, [0, 0]);
  engine.locate(a.id, question().id, [-3.7, 40.4]);
  const before = engine.snapshot(a.id).room!.location;
  engine.disconnect(a.id);
  engine.connect(a.name, a.token);
  assert.deepEqual(engine.snapshot(a.id).room!.location, before);
  assert.equal(engine.snapshot(b.id).room!.location!.draft, null);
  assert.equal(engine.snapshot(b.id).room!.location!.reveal, null);
  assert.equal(a.answers.length, 0);
  assert.equal('locationDraft' in engine.snapshot(b.id).room!.players[0], false);
  advance(LOCATION_MS - 1);
  assert.equal(room.locationReveal, null);
  advance(1);
  assert.deepEqual(
    room.locationReveal!.guesses.map((g) => g.correct),
    [true, false],
  );
  assert.equal(room.locationReveal!.countryId, '724');
  assert.equal(a.answers[0].timeout, false);
  assert.equal(a.answers[0].responseMs, LOCATION_MS);
  assert.equal(b.answers[0].timeout, true);
  const id = question().id;
  advance(LOCATION_REVEAL_MS - 1);
  assert.equal(question().id, id);
  advance(1);
  assert.notEqual(question().id, id);
  assert.equal(a.index, b.index);
  assert.deepEqual(engine.snapshot(a.id).room!.question, engine.snapshot(b.id).room!.question);
  assert.equal(engine.snapshot(a.id).room!.location!.draft, null);
});

test('early confirmations lock and resolve together; stale, late and invalid inputs cannot change results', () => {
  const { engine, a, b, room, advance, question } = setup();
  const id = question().id;
  assert.throws(() => engine.locate(a.id, id, [181, 0]), /Invalid/);
  assert.throws(() => engine.locate(a.id, id, [0, NaN]), /Invalid/);
  assert.throws(() => engine.locate(a.id, 'old-id', [0, 0]), /locked/);
  assert.throws(() => engine.answer(a.id, id, ''), /locked/);
  advance(400);
  engine.locate(a.id, id, [-3.7, 40.4], true);
  assert.throws(() => engine.locate(a.id, id, [0, 0]), /locked/);
  assert.equal(room.locationReveal, null);
  assert.equal(a.answers.length, 0);
  advance(300);
  engine.locate(b.id, id, [-3.7, 40.4], true);
  assert.deepEqual(
    room.locationReveal!.guesses.map((g) => g.correct),
    [true, true],
  );
  assert.equal(a.answers[0].responseMs, 400);
  assert.equal(b.answers[0].responseMs, 700);
  assert.throws(() => engine.locate(b.id, id, [0, 0], true), /locked/);
  advance(LOCATION_REVEAL_MS);
  assert.throws(() => engine.locate(a.id, id, [0, 0]), /locked/);
  const next = question().id;
  engine.locate(a.id, next, [-3.7, 40.4]);
  advance(LOCATION_MS);
  assert.throws(() => engine.locate(a.id, next, [0, 0], true), /locked/);
  assert.equal(a.answers.length, 2);
});

test('deadline is enforced even before the scheduler ticks; only the last saved point counts', () => {
  const { engine, a, b, room, question, setTime } = setup();
  engine.locate(a.id, question().id, [-3.7, 40.4]);
  setTime(a.startedAt + LOCATION_MS);
  assert.throws(() => engine.locate(a.id, question().id, [0, 0]), /Time is up/);
  engine.tick();
  assert.deepEqual(room.locationReveal!.guesses[0].point, [-3.7, 40.4]);
  assert.equal(b.answers[0].correct, false);
});

test('ten synchronized rounds finish the duel and rematch clears every location field', () => {
  const { engine, a, b, room, advance, question } = setup();
  for (let i = 0; i < 10; i++) {
    assert.equal(a.index, b.index);
    engine.locate(a.id, question().id, [-3.7, 40.4], true);
    engine.locate(b.id, question().id, [0, 0], true);
    advance(LOCATION_REVEAL_MS);
  }
  assert.equal(room.state, 'finished');
  assert.equal(a.answers.length, 10);
  assert.equal(engine.snapshot(a.id).room!.location, null);
  engine.rematch(a.id);
  engine.rematch(b.id);
  assert.equal(room.state, 'intro');
  assert.equal(room.phase, 0);
  assert.equal(room.questions.length, 4);
  assert.equal(a.locationDraft, null);
  assert.equal(b.locationConfirmedAt, null);
  assert.equal(room.locationReveal, null);
});

test('solo and arena include the fourth location phase', () => {
  const engine = new GameEngine();
  const a = engine.connect('Solo');
  engine.create(a.id, 'solo');
  assert.equal(engine.roomFor(a.id).questions.length, 4);
  const b = engine.connect('Host'),
    c = engine.connect('Guest');
  engine.create(b.id, 'arena');
  engine.join(c.id, b.roomId!);
  engine.start(b.id);
  assert.equal(engine.roomFor(b.id).questions.length, 4);
});
