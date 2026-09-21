import { randomBytes, randomUUID } from 'node:crypto';
import { generateQuestions, type Question } from './questions';
import { arenaRanking } from '../shared/ranking';
import { isInsideCountry, locationCountries } from './geography';
import {
  FEEDBACK_MS,
  ARENA_CAPACITY,
  GRACE_MS,
  INTRO_MS,
  QUESTION_MS,
  type Feedback,
  type RoomView,
  type Snapshot,
  type Statistics,
  type PlayerView,
  type Coordinates,
  type LocationView,
  LOCATION_MS,
  LOCATION_REVEAL_MS,
} from '../shared/types';
export interface Answer {
  phase: number;
  correct: boolean;
  timeout: boolean;
  responseMs: number;
}
export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
  roomId: string | null;
  lastSeen: number;
  lastCreated: number;
  index: number;
  startedAt: number;
  feedback: Feedback | null;
  feedbackUntil: number;
  answers: Answer[];
  rematch: boolean;
  locationDraft: Coordinates | null;
  locationConfirmedAt: number | null;
}
export interface Room {
  id: string;
  mode: RoomView['mode'];
  hostId: string;
  playerIds: string[];
  state: RoomView['state'];
  phase: number;
  introEndsAt: number | null;
  questions: Question[][];
  updatedAt: number;
  winnerId: string | null;
  reason: string | null;
  finalPlayers: PlayerView[] | null;
  locationReveal: LocationView['reveal'];
}
export function statistics(answers: Answer[]): Statistics {
  const correct = answers.filter((a) => a.correct).length;
  return {
    correct,
    incorrect: answers.length - correct,
    timeouts: answers.filter((a) => a.timeout).length,
    total: answers.length,
    averageMs: answers.length
      ? answers.reduce((sum, a) => sum + a.responseMs, 0) / answers.length
      : 0,
    accuracy: answers.length ? (correct / answers.length) * 100 : 0,
    phases: Array.from(
      { length: answers.some((a) => a.phase === 3) ? 4 : 3 },
      (_, p) => answers.filter((a) => a.phase === p && a.correct).length,
    ),
  };
}
export function winner(players: Pick<Player, 'id' | 'answers'>[]): string | null {
  const [a, b] = players.map((p) => ({ id: p.id, ...statistics(p.answers) }));
  if (a.correct !== b.correct) return a.correct > b.correct ? a.id : b.id;
  // Differences below 10 milliseconds are treated as an effective tie.
  return Math.abs(a.averageMs - b.averageMs) < 10 ? null : a.averageMs < b.averageMs ? a.id : b.id;
}
export class GameEngine {
  players = new Map<string, Player>();
  rooms = new Map<string, Room>();
  private tokens = new Map<string, string>();
  constructor(private now: () => number = Date.now) {}
  connect(name: string, token?: string): Player {
    const existing = token ? this.players.get(this.tokens.get(token) ?? '') : undefined;
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.lastSeen = this.now();
      return existing;
    }
    if (this.players.size >= 2000) throw new Error('The server is full. Please try again shortly.');
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(32).toString('hex'),
      name,
      connected: true,
      disconnectedAt: null,
      roomId: null,
      lastSeen: this.now(),
      lastCreated: -Infinity,
      index: 0,
      startedAt: 0,
      feedback: null,
      feedbackUntil: 0,
      answers: [],
      rematch: false,
      locationDraft: null,
      locationConfirmedAt: null,
    };
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    return player;
  }
  disconnect(id: string) {
    const p = this.player(id);
    p.connected = false;
    p.disconnectedAt = this.now();
    p.lastSeen = this.now();
  }
  exit(id: string) {
    const p = this.player(id);
    if (p.roomId) throw new Error('Leave your lobby or game before exiting.');
    this.tokens.delete(p.token);
    this.players.delete(id);
  }
  player(id: string): Player {
    const p = this.players.get(id);
    if (!p) throw new Error('Guest session expired. Please reconnect.');
    return p;
  }
  roomFor(id: string): Room {
    const p = this.player(id);
    const r = this.rooms.get(p.roomId ?? '');
    if (!r) throw new Error('This room is no longer available.');
    return r;
  }
  create(id: string, mode: RoomView['mode'] = 'duel') {
    const p = this.player(id);
    if (!p.connected) throw new Error('Reconnect before starting a game.');
    if (p.roomId) throw new Error('Leave your current room first.');
    if (this.now() - p.lastCreated < 3000)
      throw new Error('Please wait a moment before creating another room.');
    if (this.rooms.size >= 200)
      throw new Error('All rooms are busy. Please join an available room.');
    let code: string;
    do {
      code = randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    this.rooms.set(code, {
      id: code,
      mode,
      hostId: id,
      playerIds: [id],
      state: 'waiting',
      phase: 0,
      introEndsAt: null,
      questions: [],
      updatedAt: this.now(),
      winnerId: null,
      reason: null,
      finalPlayers: null,
      locationReveal: null,
    });
    p.roomId = code;
    p.lastCreated = this.now();
    this.reset(p);
    if (mode === 'solo') this.begin(this.roomFor(id));
  }
  join(id: string, roomId: string) {
    const p = this.player(id);
    const r = this.rooms.get(roomId);
    if (p.roomId === roomId) return;
    if (p.roomId) throw new Error('Leave your current room first.');
    if (
      !r ||
      r.mode === 'solo' ||
      r.state !== 'waiting' ||
      r.playerIds.length >= (r.mode === 'arena' ? ARENA_CAPACITY : 2) ||
      !this.player(r.hostId).connected
    )
      throw new Error('This room is no longer available to join.');
    r.playerIds.push(id);
    r.updatedAt = this.now();
    p.roomId = roomId;
    this.reset(p);
  }
  leave(id: string) {
    const p = this.player(id);
    const r = this.rooms.get(p.roomId ?? '');
    p.roomId = null;
    if (!r) return;
    r.playerIds = r.playerIds.filter((pid) => pid !== id);
    r.updatedAt = this.now();
    if (!r.playerIds.length) {
      this.rooms.delete(r.id);
      return;
    }
    r.hostId = r.playerIds[0];
    if (r.mode === 'arena') {
      if (['intro', 'playing'].includes(r.state) && r.playerIds.length < 2) {
        r.state = 'abandoned';
        r.reason = 'There are not enough players to continue this arena.';
      }
      return;
    }
    if (r.state !== 'waiting') {
      r.state = 'abandoned';
      r.reason = 'Your opponent left the match.';
    }
  }
  start(id: string) {
    const r = this.roomFor(id);
    if (r.hostId !== id || r.state !== 'waiting')
      throw new Error('Only the host can start a waiting match.');
    this.begin(r);
  }
  private begin(r: Room) {
    if (
      (r.mode === 'arena'
        ? r.playerIds.length < 2 || r.playerIds.length > ARENA_CAPACITY
        : r.playerIds.length !== (r.mode === 'solo' ? 1 : 2)) ||
      r.playerIds.some((id) => !this.player(id).connected)
    )
      throw new Error(
        r.mode === 'solo'
          ? 'Reconnect before starting a game.'
          : r.mode === 'arena'
            ? 'An arena needs 2–8 connected players to start.'
            : 'Both players must be connected to start.',
      );
    r.questions = generateQuestions(r.mode === 'duel');
    r.phase = 0;
    r.winnerId = null;
    r.reason = null;
    r.finalPlayers = null;
    r.locationReveal = null;
    for (const id of r.playerIds) this.reset(this.player(id));
    this.intro(r);
  }
  private reset(p: Player) {
    p.index = 0;
    p.startedAt = 0;
    p.feedback = null;
    p.feedbackUntil = 0;
    p.answers = [];
    p.rematch = false;
    p.locationDraft = null;
    p.locationConfirmedAt = null;
  }
  private intro(r: Room) {
    r.state = 'intro';
    r.introEndsAt = this.now() + INTRO_MS;
    r.updatedAt = this.now();
    for (const id of r.playerIds) {
      const p = this.player(id);
      p.index = 0;
      p.feedback = null;
    }
  }
  rematch(id: string) {
    const r = this.roomFor(id);
    if (r.state !== 'finished') throw new Error('Finish this match before playing again.');
    if (r.mode === 'arena') {
      if (r.hostId !== id) throw new Error('Only the host can reopen the arena.');
      r.state = 'waiting';
      r.phase = 0;
      r.questions = [];
      r.winnerId = null;
      r.finalPlayers = null;
      r.updatedAt = this.now();
      for (const pid of r.playerIds) this.reset(this.player(pid));
      return;
    }
    this.player(id).rematch = true;
    if (r.playerIds.every((pid) => this.player(pid).rematch && this.player(pid).connected))
      this.begin(r);
  }
  answer(id: string, questionId: string, optionId: string) {
    const p = this.player(id);
    const r = this.roomFor(id);
    const q = r.questions[r.phase]?.[p.index];
    if (r.state !== 'playing' || !q || q.kind === 'location' || q.id !== questionId || p.feedback)
      throw new Error('This question is already locked or no longer active.');
    if (!q.options.some((o) => o.id === optionId)) throw new Error('Invalid answer option.');
    if (this.now() >= p.startedAt + QUESTION_MS) {
      this.lock(r, p, null);
      throw new Error('Time is up for this question.');
    }
    this.lock(r, p, optionId);
  }
  locate(id: string, questionId: string, point: Coordinates, confirm = false) {
    const p = this.player(id),
      r = this.roomFor(id);
    const q = r.questions[r.phase]?.[p.index];
    if (
      r.state !== 'playing' ||
      q?.kind !== 'location' ||
      q.id !== questionId ||
      r.locationReveal ||
      p.locationConfirmedAt !== null
    )
      throw new Error('This location round is already locked or no longer active.');
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new Error('Invalid map coordinates.');
    if (this.now() >= p.startedAt + LOCATION_MS) throw new Error('Time is up for this location.');
    p.locationDraft = [...point];
    if (confirm) p.locationConfirmedAt = this.now();
    r.updatedAt = this.now();
    this.resolveLocation(r);
  }
  private resolveLocation(r: Room): boolean {
    if (r.locationReveal) return false;
    const players = r.playerIds.map((id) => this.player(id));
    const deadline = players[0].startedAt + LOCATION_MS;
    if (this.now() >= deadline) for (const p of players) p.locationConfirmedAt ??= deadline;
    if (players.some((p) => p.locationConfirmedAt === null)) return false;
    const q = r.questions[r.phase][players[0].index];
    const scores = players.map((p) => isInsideCountry(q.country, p.locationDraft));
    const until = this.now() + LOCATION_REVEAL_MS;
    players.forEach((p, i) => {
      const responseMs = Math.min(LOCATION_MS, p.locationConfirmedAt! - p.startedAt);
      p.feedback = {
        correct: scores[i],
        timeout: p.locationDraft === null,
        correctOptionId: '',
        selectedId: null,
        responseMs,
      };
      p.answers.push({
        phase: r.phase,
        correct: scores[i],
        timeout: p.locationDraft === null,
        responseMs,
      });
      p.feedbackUntil = until;
    });
    r.locationReveal = {
      countryId: locationCountries.find((c) => c.code === q.country)!.numeric,
      until,
      guesses: players.map((p, i) => ({
        playerId: p.id,
        point: p.locationDraft,
        correct: scores[i],
      })),
    };
    r.updatedAt = this.now();
    return true;
  }
  private lock(r: Room, p: Player, selectedId: string | null) {
    const q = r.questions[r.phase][p.index];
    const responseMs = selectedId === null ? QUESTION_MS : Math.max(0, this.now() - p.startedAt);
    p.feedback = {
      correct: selectedId === q.correctOptionId,
      timeout: selectedId === null,
      correctOptionId: q.correctOptionId,
      selectedId,
      responseMs,
    };
    p.answers.push({
      phase: r.phase,
      correct: p.feedback.correct,
      timeout: p.feedback.timeout,
      responseMs,
    });
    p.feedbackUntil = this.now() + FEEDBACK_MS;
    r.updatedAt = this.now();
  }
  tick(): boolean {
    let changed = false;
    const now = this.now();
    for (const r of this.rooms.values()) {
      if (
        r.playerIds.some((id) => {
          const p = this.player(id);
          return !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= GRACE_MS;
        })
      ) {
        for (const id of [...r.playerIds]) {
          const p = this.player(id);
          if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= GRACE_MS)
            this.leave(id);
        }
        if (this.rooms.has(r.id) && r.state === 'abandoned' && r.mode !== 'arena')
          r.reason = 'Your opponent did not reconnect in time.';
        changed = true;
        continue;
      }
      if (
        ['waiting', 'finished', 'abandoned'].includes(r.state) &&
        now - r.updatedAt > 15 * 60_000
      ) {
        for (const id of r.playerIds) this.player(id).roomId = null;
        this.rooms.delete(r.id);
        changed = true;
        continue;
      }
      if (r.state === 'intro' && now >= r.introEndsAt!) {
        r.state = 'playing';
        for (const id of r.playerIds) this.player(id).startedAt = now;
        changed = true;
      }
      if (r.state !== 'playing') continue;
      if (r.questions[r.phase][0]?.kind === 'location') {
        if (r.locationReveal && now >= r.locationReveal.until) {
          for (const id of r.playerIds) {
            const p = this.player(id);
            p.index++;
            p.feedback = null;
            p.locationDraft = null;
            p.locationConfirmedAt = null;
            p.startedAt = now;
          }
          r.locationReveal = null;
          if (this.player(r.playerIds[0]).index === 10) {
            r.state = 'finished';
            r.winnerId = winner(r.playerIds.map((id) => this.player(id)));
            r.updatedAt = now;
          }
          changed = true;
        } else if (!r.locationReveal && this.resolveLocation(r)) changed = true;
        continue;
      }
      for (const id of r.playerIds) {
        const p = this.player(id);
        if (p.index >= 10) continue;
        if (p.feedback && now >= p.feedbackUntil) {
          p.index++;
          p.feedback = null;
          p.startedAt = now;
          changed = true;
        } else if (!p.feedback && now >= p.startedAt + QUESTION_MS) {
          this.lock(r, p, null);
          changed = true;
        }
      }
      if (r.playerIds.every((id) => this.player(id).index === 10)) {
        if (r.phase === r.questions.length - 1) {
          r.state = 'finished';
          r.winnerId = r.mode === 'duel' ? winner(r.playerIds.map((id) => this.player(id))) : null;
          if (r.mode === 'arena') {
            r.finalPlayers = r.playerIds.map((id) => this.playerView(id, r.phase));
            const leaders = arenaRanking(r.finalPlayers).filter((entry) => entry.rank === 1);
            r.winnerId = leaders.length === 1 ? leaders[0].player.id : null;
          }
          r.updatedAt = now;
        } else {
          r.phase++;
          this.intro(r);
        }
        changed = true;
      }
    }
    for (const [id, p] of this.players)
      if (!p.connected && !p.roomId && now - p.lastSeen > 2 * 60 * 60_000) {
        this.players.delete(id);
        this.tokens.delete(p.token);
      }
    return changed;
  }
  snapshot(id: string): Snapshot {
    const p = this.player(id);
    const r = this.rooms.get(p.roomId ?? '');
    const q = r?.state === 'playing' ? r.questions[r.phase][p.index] : undefined;
    return {
      serverNow: this.now(),
      me: { id: p.id, name: p.name },
      rooms: [...this.rooms.values()]
        .filter((r) => r.mode !== 'solo' && r.state !== 'abandoned')
        .map((r) => ({
          id: r.id,
          mode: r.mode as 'duel' | 'arena',
          host: this.player(r.hostId).name,
          count: r.playerIds.length,
          status:
            r.state === 'waiting'
              ? r.playerIds.length >= 2
                ? 'ready'
                : 'waiting'
              : r.state === 'finished'
                ? 'finished'
                : 'playing',
          joinable:
            r.state === 'waiting' &&
            r.playerIds.length < (r.mode === 'arena' ? ARENA_CAPACITY : 2) &&
            this.player(r.hostId).connected,
        })),
      room: r
        ? {
            id: r.id,
            mode: r.mode,
            hostId: r.hostId,
            state: r.state,
            phase: r.phase,
            introEndsAt: r.introEndsAt,
            players: r.finalPlayers ?? r.playerIds.map((id) => this.playerView(id, r.phase)),
            question: q
              ? {
                  id: q.id,
                  kind: q.kind,
                  prompt: q.prompt,
                  visual: q.visual,
                  options: q.options,
                  number: p.index + 1,
                  startedAt: p.startedAt,
                  deadline: p.startedAt + (q.kind === 'location' ? LOCATION_MS : QUESTION_MS),
                }
              : null,
            feedback: q ? p.feedback : null,
            location:
              q?.kind === 'location'
                ? {
                    draft: p.locationDraft,
                    confirmed: p.locationConfirmedAt !== null,
                    reveal: r.locationReveal,
                  }
                : null,
            phaseComplete: p.index === 10,
            winnerId: r.winnerId,
            reason: r.reason,
          }
        : null,
    };
  }
  private playerView(id: string, phase: number): PlayerView {
    const p = this.player(id);
    return {
      id,
      name: p.name,
      connected: p.connected,
      reconnectUntil: p.disconnectedAt === null ? null : p.disconnectedAt + GRACE_MS,
      progress: Math.min(10, p.index + (p.feedback ? 1 : 0)),
      phaseAnswers: p.answers
        .filter((answer) => answer.phase === phase)
        .map((answer) => answer.correct),
      stats: statistics(p.answers),
      rematch: p.rematch,
    };
  }
}
