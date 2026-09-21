import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../backend/engine';
import {
  FEEDBACK_MS,
  GRACE_MS,
  INTRO_MS,
  LOCATION_REVEAL_MS,
  LOCATION_MS,
  type PlayerView,
} from '../shared/types';
import { arenaRanking } from '../shared/ranking';

function setup(count = 8) {
  let now = 100_000;
  const engine = new GameEngine(() => now);
  const players = Array.from({ length: count }, (_, i) => engine.connect(`Explorer ${i + 1}`));
  engine.create(players[0].id, 'arena');
  const room = engine.roomFor(players[0].id);
  for (const p of players.slice(1)) engine.join(p.id, room.id);
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  return { engine, players, room, advance };
}

test('arena has its own lobby mode, accepts eight, rejects a ninth and locks entry on start', () => {
  const { engine, players, room, advance } = setup();
  const observer = engine.connect('Observer');
  assert.equal(engine.snapshot(observer.id).rooms[0].mode, 'arena');
  assert.equal(engine.snapshot(observer.id).rooms[0].joinable, false);
  assert.throws(() => engine.join(observer.id, room.id), /no longer available/);
  assert.throws(() => engine.start(players[1].id), /Only the host/);
  engine.start(players[0].id);
  engine.leave(players[7].id);
  assert.throws(() => engine.join(observer.id, room.id), /no longer available/);
  advance(INTRO_MS);
  const question = engine.snapshot(players[0].id).room!.question;
  for (const p of players.slice(0, 7))
    assert.deepEqual(engine.snapshot(p.id).room!.question, question);
  assert.equal('correctOptionId' in question!, false);
});

test('host can start an arena with any connected group from two through eight', () => {
  for (let count = 1; count <= 8; count++) {
    const { engine, players, room } = setup(count);
    if (count === 1) assert.throws(() => engine.start(players[0].id), /2–8/);
    else {
      engine.disconnect(players[1].id);
      assert.throws(() => engine.start(players[0].id), /connected/);
      engine.connect(players[1].name, players[1].token);
      engine.start(players[0].id);
      assert.equal(room.state, 'intro');
    }
  }
});

test('all eight finish forty questions; ranking considers every player; host reopens a fresh arena', () => {
  const { engine, players, room, advance } = setup();
  engine.start(players[0].id);
  for (let phase = 0; phase < 3; phase++) {
    advance(INTRO_MS);
    for (let n = 0; n < 10; n++) {
      advance(100);
      const q = room.questions[phase][n];
      for (const [i, p] of players.entries()) {
        engine.answer(
          p.id,
          q.id,
          i === 7 ? q.correctOptionId : q.options.find((o) => o.id !== q.correctOptionId)!.id,
        );
      }
      advance(FEEDBACK_MS);
    }
  }
  advance(INTRO_MS);
  assert.equal(room.phase, 3);
  for (let n = 0; n < 10; n++) {
    const q = room.questions[3][n];
    q.country = 'ES';
    for (const [i, p] of players.entries()) {
      engine.locate(p.id, q.id, i === 7 ? [-3.7, 40.4] : [0, 0], true);
      if (i < 7) assert.equal(room.locationReveal, null);
    }
    assert.equal(room.locationReveal!.guesses.length, 8);
    advance(LOCATION_REVEAL_MS);
  }
  assert.equal(room.state, 'finished');
  assert.equal(room.winnerId, players[7].id);
  const final = engine.snapshot(players[0].id).room!;
  assert.ok(final.players.every((p) => p.stats.total === 40));
  assert.equal(arenaRanking(final.players)[0].player.id, players[7].id);
  engine.leave(players[7].id);
  assert.deepEqual(engine.snapshot(players[0].id).room!.players, final.players);
  assert.throws(() => engine.rematch(players[1].id), /Only the host/);
  engine.rematch(players[0].id);
  assert.equal(room.state, 'waiting');
  assert.equal(engine.snapshot(players[0].id).room!.players.length, 7);
  assert.ok(players.slice(0, 7).every((p) => p.answers.length === 0));
  assert.equal(engine.snapshot(players[0].id).rooms[0].joinable, true);
  engine.start(players[0].id);
  assert.equal(room.state, 'intro');
});

test('arena waits for everyone, keeps private feedback and restores reconnecting players', () => {
  const { engine, players, room, advance } = setup(3);
  engine.start(players[0].id);
  advance(INTRO_MS);
  for (let i = 0; i < 10; i++) {
    const q = room.questions[0][i];
    engine.answer(players[0].id, q.id, q.correctOptionId);
    if (i === 0) {
      assert.equal(engine.snapshot(players[1].id).room!.feedback, null);
      const before = engine.snapshot(players[0].id).room!;
      engine.disconnect(players[0].id);
      engine.connect(players[0].name, players[0].token);
      assert.deepEqual(engine.snapshot(players[0].id).room, before);
    }
    advance(FEEDBACK_MS);
  }
  assert.equal(room.phase, 0);
  assert.equal(engine.snapshot(players[0].id).room!.phaseComplete, true);
  for (let i = 0; i < 10; i++) {
    const q = room.questions[0][i];
    for (const p of players.slice(1)) engine.answer(p.id, q.id, q.correctOptionId);
    advance(FEEDBACK_MS);
  }
  assert.equal(room.phase, 1);
  assert.equal(room.state, 'intro');
});

test('arena survives departures and grace expiry, migrates host, and ends only below two players', () => {
  const { engine, players, room, advance } = setup(4);
  engine.start(players[0].id);
  advance(INTRO_MS);
  engine.leave(players[0].id);
  assert.equal(room.hostId, players[1].id);
  assert.equal(room.state, 'playing');
  engine.disconnect(players[2].id);
  advance(GRACE_MS);
  assert.equal(room.playerIds.length, 2);
  assert.equal(room.state, 'playing');
  engine.leave(players[3].id);
  assert.equal(room.state, 'abandoned');
  assert.match(room.reason!, /not enough players/);
});

test('arena ties share ranks consistently regardless of input order', () => {
  const { engine, players } = setup(4);
  const views = engine.snapshot(players[0].id).room!.players;
  const scored: PlayerView[] = views.map((p, i) => ({
    ...p,
    stats: { ...p.stats, correct: 20, averageMs: [118, 109, 100, 200][i] },
  }));
  assert.deepEqual(
    arenaRanking(scored).map((entry) => entry.rank),
    [1, 1, 3, 4],
  );
  assert.deepEqual(
    arenaRanking(scored).map((entry) => entry.player.id),
    arenaRanking([...scored].reverse()).map((entry) => entry.player.id),
  );
});

test('arena location hides guesses until everyone locks, restores drafts and handles absent players', () => {
  const { engine, players, room, advance } = setup(4);
  engine.start(players[0].id);
  room.phase = 3;
  const q = room.questions[3][0];
  q.country = 'ES';
  advance(INTRO_MS);
  engine.locate(players[0].id, q.id, [-3.7, 40.4], true);
  engine.locate(players[1].id, q.id, [-3.7, 40.4]);
  const before = engine.snapshot(players[1].id).room!.location;
  engine.disconnect(players[1].id);
  engine.connect(players[1].name, players[1].token);
  assert.deepEqual(engine.snapshot(players[1].id).room!.location, before);
  assert.equal(engine.snapshot(players[2].id).room!.location!.draft, null);
  assert.equal(engine.snapshot(players[2].id).room!.location!.reveal, null);
  engine.leave(players[3].id);
  advance(LOCATION_MS);
  assert.deepEqual(
    room.locationReveal!.guesses.map((g) => g.correct),
    [true, true, false],
  );
  assert.equal(players[1].answers[0].timeout, false);
  assert.equal(players[2].answers[0].timeout, true);
  advance(LOCATION_REVEAL_MS);
  assert.ok(players.slice(0, 3).every((p) => p.index === 1 && p.locationDraft === null));
  const next = room.questions[3][1];
  engine.locate(players[0].id, next.id, [0, 0], true);
  engine.locate(players[1].id, next.id, [0, 0], true);
  assert.equal(room.locationReveal, null);
  engine.leave(players[2].id);
  advance(1);
  assert.equal(room.locationReveal!.guesses.length, 2);
  assert.equal(room.state, 'playing');
});

test('arena final location can decide a shared victory and preserves the full standings', () => {
  const { engine, players, room, advance } = setup(3);
  engine.start(players[0].id);
  room.phase = 3;
  advance(INTRO_MS);
  for (const p of players) p.index = 9;
  const q = room.questions[3][9];
  q.country = 'ES';
  for (const [i, p] of players.entries())
    engine.locate(p.id, q.id, i === 0 ? [0, 0] : [-3.7, 40.4], true);
  advance(LOCATION_REVEAL_MS);
  assert.equal(room.state, 'finished');
  assert.equal(room.winnerId, null);
  const final = engine.snapshot(players[0].id).room!.players;
  assert.deepEqual(
    arenaRanking(final).map((entry) => entry.rank),
    [1, 1, 3],
  );
  engine.leave(players[2].id);
  assert.deepEqual(engine.snapshot(players[0].id).room!.players, final);
});
