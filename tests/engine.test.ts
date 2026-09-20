import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, statistics, winner, type Answer } from '../backend/engine';
import { generateQuestions } from '../backend/questions';
import assets from '../data/assets.json';
import { FEEDBACK_MS, GRACE_MS, INTRO_MS, QUESTION_MS } from '../shared/types';
function setup(start = true) {
  let now = 100_000;
  const engine = new GameEngine(() => now);
  const a = engine.connect('Alex');
  const b = engine.connect('Sam');
  engine.create(a.id);
  engine.join(b.id, a.roomId!);
  const room = engine.roomFor(a.id);
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  if (start) {
    engine.start(a.id);
    advance(INTRO_MS);
  }
  const answer = (id: string, correct = true) => {
    const p = engine.player(id);
    const q = room.questions[room.phase][p.index];
    engine.answer(
      id,
      q.id,
      correct ? q.correctOptionId : q.options.find((o) => o.id !== q.correctOptionId)!.id,
    );
  };
  return {
    engine,
    a,
    b,
    room,
    advance,
    answer,
    setTime: (value: number) => {
      now = value;
    },
  };
}
test('solo games start immediately, stay private, score all phases and restart with one player', () => {
  let now = 100_000;
  const engine = new GameEngine(() => now);
  const player = engine.connect('Solo explorer');
  const observer = engine.connect('Observer');
  const advance = (ms: number) => {
    now += ms;
    engine.tick();
  };
  engine.create(player.id, 'solo');
  const room = engine.roomFor(player.id);
  assert.equal(room.state, 'intro');
  assert.equal(engine.snapshot(player.id).room!.mode, 'solo');
  assert.deepEqual(room.playerIds, [player.id]);
  assert.deepEqual(engine.snapshot(observer.id).rooms, []);
  assert.throws(() => engine.join(observer.id, room.id), /no longer available/);
  assert.throws(() => engine.create(player.id, 'solo'), /Leave your current room/);
  const oldQuestion = room.questions[0][0].id;
  for (let phase = 0; phase < 3; phase++) {
    advance(INTRO_MS);
    assert.equal(room.state, 'playing');
    assert.equal(room.phase, phase);
    for (let index = 0; index < 10; index++) {
      const question = room.questions[phase][index];
      if (index === 9) {
        advance(QUESTION_MS);
      } else {
        advance(100);
        engine.answer(
          player.id,
          question.id,
          index % 2 === 0
            ? question.correctOptionId
            : question.options.find((o) => o.id !== question.correctOptionId)!.id,
        );
      }
      if (phase === 0 && index === 0) {
        const before = engine.snapshot(player.id).room;
        engine.disconnect(player.id);
        assert.equal(engine.connect(player.name, player.token).id, player.id);
        assert.deepEqual(engine.snapshot(player.id).room, before);
      }
      advance(FEEDBACK_MS);
    }
    assert.equal(room.state, phase === 2 ? 'finished' : 'intro');
  }
  const stats = engine.snapshot(player.id).room!.players[0].stats;
  assert.equal(stats.total, 30);
  assert.equal(stats.correct, 15);
  assert.equal(stats.incorrect, 15);
  assert.equal(stats.timeouts, 3);
  assert.deepEqual(stats.phases, [5, 5, 5]);
  assert.equal(room.winnerId, null);
  assert.deepEqual(engine.snapshot(observer.id).rooms, []);
  engine.rematch(player.id);
  assert.equal(room.state, 'intro');
  assert.equal(room.phase, 0);
  assert.notEqual(room.questions[0][0].id, oldQuestion);
  assert.equal(player.answers.length, 0);
  engine.leave(player.id);
  assert.equal(engine.snapshot(player.id).room, null);
  assert.equal(engine.rooms.has(room.id), false);
});
test('a disconnected solo game is cleaned up after the reconnection grace period', () => {
  let now = 100_000;
  const engine = new GameEngine(() => now);
  const player = engine.connect('Solo explorer');
  engine.create(player.id, 'solo');
  const roomId = player.roomId!;
  engine.disconnect(player.id);
  now += GRACE_MS;
  engine.tick();
  assert.equal(engine.rooms.has(roomId), false);
  assert.equal(player.roomId, null);
});
test('question sets have three phases, ten distinct countries, six unique options and exactly one correct answer', () => {
  for (let attempt = 0; attempt < 15; attempt++) {
    const phases = generateQuestions();
    assert.equal(phases.length, 3);
    for (const questions of phases) {
      assert.equal(questions.length, 10);
      assert.equal(new Set(questions.map((q) => q.country)).size, 10);
      for (const q of questions) {
        assert.equal(q.options.length, 6);
        assert.equal(new Set(q.options.map((o) => o.text)).size, 6);
        assert.equal(new Set(q.options.map((o) => o.id)).size, 6);
        assert.equal(q.options.filter((o) => o.id === q.correctOptionId).length, 1);
      }
    }
    assert.ok(phases[0].every((q) => q.visual?.startsWith('data:image/svg+xml;base64,')));
    assert.ok(phases[1].every((q) => q.visual?.startsWith('data:image/svg+xml;base64,')));
    assert.ok(phases[2].every((q) => q.prompt.startsWith('What is the capital') && !q.visual));
  }
});
test('both players see identical question, visual, options, and deadline without an answer key', () => {
  const { engine, a, b } = setup();
  const left = engine.snapshot(a.id);
  const right = engine.snapshot(b.id);
  assert.deepEqual(left.room!.question, right.room!.question);
  const q = left.room!.question!;
  assert.equal(q.deadline - q.startedAt, QUESTION_MS);
  assert.equal('correctOptionId' in q, false);
  assert.equal('country' in q, false);
  assert.equal(left.room!.feedback, null);
  assert.equal('token' in left.me, false);
  assert.equal('questions' in left.room!, false);
});
test('correct, incorrect, and timeout stats use server response times', () => {
  const { engine, a, b, advance, answer } = setup();
  advance(1250);
  answer(a.id);
  answer(b.id, false);
  assert.equal(statistics(a.answers).correct, 1);
  assert.equal(statistics(b.answers).incorrect, 1);
  assert.equal(a.answers[0].responseMs, 1250);
  advance(FEEDBACK_MS);
  advance(QUESTION_MS);
  assert.equal(statistics(a.answers).timeouts, 1);
  assert.equal(a.answers[1].responseMs, 10000);
  assert.equal(statistics(a.answers).averageMs, 5625);
  assert.equal(engine.snapshot(a.id).room!.feedback!.timeout, true);
  for (const viewer of [a, b]) {
    const players = engine.snapshot(viewer.id).room!.players;
    assert.deepEqual(players[0].phaseAnswers, [true, false]);
    assert.deepEqual(players[1].phaseAnswers, [false, false]);
  }
});
test('answers lock, duplicate and invalid answers are rejected without changing scores', () => {
  const { engine, a, room, answer } = setup();
  const q = room.questions[0][0];
  assert.throws(() => engine.answer(a.id, q.id, 'invalid'), /Invalid answer/);
  assert.equal(a.answers.length, 0);
  answer(a.id);
  assert.throws(() => engine.answer(a.id, q.id, q.correctOptionId), /locked/);
  assert.equal(a.answers.length, 1);
});
test('late answers are rejected at the exact deadline even before the scheduler runs', () => {
  const { engine, a, room, setTime } = setup();
  const q = room.questions[0][0];
  setTime(a.startedAt + QUESTION_MS);
  assert.throws(() => engine.answer(a.id, q.id, q.correctOptionId), /Time is up/);
  assert.equal(a.answers[0].timeout, true);
  assert.equal(a.answers[0].correct, false);
});
test('timeouts happen at 10 seconds, never early, and cannot be submitted twice', () => {
  const { a, advance } = setup();
  advance(9999);
  assert.equal(a.answers.length, 0);
  advance(1);
  assert.equal(a.answers.length, 1);
  advance(1);
  assert.equal(a.answers.length, 1);
});
test('feedback is private to the player whose answer has locked', () => {
  const { engine, a, b, answer } = setup();
  answer(a.id);
  assert.ok(engine.snapshot(a.id).room!.feedback?.correctOptionId);
  assert.equal(engine.snapshot(b.id).room!.feedback, null);
  assert.equal(engine.snapshot(b.id).room!.players[0].stats.correct, 1);
});
test('players progress independently and phase barrier opens exactly once when both finish', () => {
  const { engine, a, b, room, advance, answer } = setup();
  for (let n = 0; n < 10; n++) {
    answer(a.id);
    advance(FEEDBACK_MS);
  }
  assert.equal(a.index, 10);
  assert.equal(b.index, 0);
  assert.equal(room.phase, 0);
  assert.equal(engine.snapshot(a.id).room!.phaseComplete, true);
  assert.equal(engine.snapshot(a.id).room!.question, null);
  for (let n = 0; n < 10; n++) {
    answer(b.id);
    advance(FEEDBACK_MS);
  }
  assert.equal(room.state, 'intro');
  assert.equal(room.phase, 1);
  assert.ok(engine.snapshot(a.id).room!.players.every((p) => p.phaseAnswers.length === 0));
  const deadline = room.introEndsAt;
  engine.tick();
  engine.tick();
  assert.equal(room.introEndsAt, deadline);
  assert.equal(room.phase, 1);
  advance(INTRO_MS);
  assert.equal(room.state, 'playing');
  assert.equal(a.index, 0);
  assert.equal(b.index, 0);
  assert.deepEqual(engine.snapshot(a.id).room!.question, engine.snapshot(b.id).room!.question);
});
test('all 30 answers finish a match with correct results, and mutual rematch creates fresh questions', () => {
  const { engine, a, b, room, advance, answer } = setup();
  const oldId = room.questions[0][0].id;
  for (let phase = 0; phase < 3; phase++) {
    for (let i = 0; i < 10; i++) {
      advance(100);
      answer(a.id);
      advance(100);
      answer(b.id, i % 2 === 0);
      advance(FEEDBACK_MS);
    }
    if (phase < 2) advance(INTRO_MS);
  }
  assert.equal(room.state, 'finished');
  assert.equal(a.answers.length, 30);
  assert.equal(b.answers.length, 30);
  assert.equal(room.winnerId, a.id);
  assert.deepEqual(statistics(a.answers).phases, [10, 10, 10]);
  assert.equal(statistics(b.answers).correct, 15);
  assert.equal(statistics(b.answers).accuracy, 50);
  assert.equal(statistics(a.answers).averageMs, 100);
  assert.equal(statistics(b.answers).averageMs, 200);
  assert.deepEqual(
    engine.snapshot(a.id).room!.players[1].phaseAnswers,
    Array.from({ length: 10 }, (_, i) => i % 2 === 0),
  );
  engine.rematch(a.id);
  assert.equal(room.state, 'finished');
  engine.rematch(a.id);
  assert.equal(room.state, 'finished');
  engine.rematch(b.id);
  assert.equal(room.state, 'intro');
  assert.notEqual(room.questions[0][0].id, oldId);
  assert.equal(a.answers.length, 0);
  assert.ok(engine.snapshot(a.id).room!.players.every((p) => p.phaseAnswers.length === 0));
});
test('ranking prioritizes accuracy, then speed, and near-identical averages draw', () => {
  const answers = (correct: boolean, responseMs: number): Answer[] => [
    { phase: 0, correct, timeout: false, responseMs },
  ];
  assert.equal(
    winner([
      { id: 'a', answers: answers(true, 9000) },
      { id: 'b', answers: answers(false, 10) },
    ]),
    'a',
  );
  assert.equal(
    winner([
      { id: 'a', answers: answers(true, 200) },
      { id: 'b', answers: answers(true, 100) },
    ]),
    'b',
  );
  assert.equal(
    winner([
      { id: 'a', answers: answers(true, 104) },
      { id: 'b', answers: answers(true, 100) },
    ]),
    null,
  );
  assert.equal(
    winner([
      { id: 'a', answers: answers(true, 100) },
      { id: 'b', answers: answers(true, 100) },
    ]),
    null,
  );
  assert.equal(statistics([]).averageMs, 0);
});
test('only two players may join and only a connected pair with host authorization may start', () => {
  const { engine, a, b } = setup(false);
  const c = engine.connect('Third player');
  assert.throws(() => engine.join(c.id, a.roomId!), /no longer available/);
  assert.throws(() => engine.start(b.id), /Only the host/);
  engine.disconnect(b.id);
  assert.throws(() => engine.start(a.id), /Both players/);
  engine.leave(b.id);
  assert.throws(() => engine.start(a.id), /Both players/);
});
test('reconnection restores identity, deadline, answer lock, and scores', () => {
  const { engine, a, advance, answer } = setup();
  const originalQuestion = engine.snapshot(a.id).room!.question;
  engine.disconnect(a.id);
  advance(1200);
  const restored = engine.connect('Ignored new name', a.token);
  assert.equal(restored.id, a.id);
  assert.equal(restored.name, 'Alex');
  assert.deepEqual(engine.snapshot(a.id).room!.question, originalQuestion);
  answer(a.id);
  engine.disconnect(a.id);
  engine.connect('Alex', a.token);
  assert.equal(engine.snapshot(a.id).room!.feedback!.correct, true);
  assert.equal(a.answers.length, 1);
});
test('disconnect expiration ends a match and abandoned rooms cannot be joined', () => {
  const { engine, a, b, room, advance } = setup();
  engine.disconnect(b.id);
  advance(GRACE_MS);
  assert.equal(room.state, 'abandoned');
  assert.equal(b.roomId, null);
  assert.equal(engine.snapshot(a.id).rooms.length, 0);
  engine.leave(a.id);
  assert.equal(engine.rooms.size, 0);
});
test('host migration and stale room cleanup do not strand players', () => {
  const { engine, a, b, room, advance } = setup(false);
  engine.leave(a.id);
  assert.equal(room.hostId, b.id);
  const c = engine.connect('Chris');
  engine.join(c.id, room.id);
  assert.equal(room.playerIds.length, 2);
  advance(15 * 60_000 + 1);
  assert.equal(engine.rooms.size, 0);
  assert.equal(b.roomId, null);
  assert.equal(c.roomId, null);
});
test('stale question IDs and stale rematch submissions cannot score', () => {
  const { engine, a, room, answer, advance } = setup();
  const old = room.questions[0][0];
  answer(a.id);
  advance(FEEDBACK_MS);
  assert.throws(() => engine.answer(a.id, old.id, old.correctOptionId), /no longer active/);
  assert.equal(a.answers.length, 1);
});

test('bundled SVGs do not expose country-code identifiers or descriptive answer hints', () => {
  for (const item of Object.values(assets)) {
    assert.doesNotMatch(item.flag, /flag-icons-|<(title|desc|metadata)\b/);
    for (const id of item.flag.matchAll(/\bid="([^"]+)"/g)) assert.match(id[1], /^visual-\d+$/);
    assert.doesNotMatch(item.shape, /<(title|desc|metadata)\b/);
  }
});
