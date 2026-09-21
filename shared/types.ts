export const PHASES = ['Country Shapes', 'Flags', 'Capitals'] as const;
export const INSTRUCTIONS = [
  'Identify the country from its shape.',
  'Identify the country from its flag.',
  'Choose the capital of the country.',
] as const;
export const QUESTION_MS = 10_000;
export const INTRO_MS = 3_000;
export const FEEDBACK_MS = 850;
export const GRACE_MS = 45_000;
export const ARENA_CAPACITY = 8;
export const DUEL_PHASES = [...PHASES, 'Location'] as const;
export const LOCATION_MS = 15_000;
export const LOCATION_REVEAL_MS = 4_000;
export type Coordinates = [number, number]; // longitude, latitude
export interface LocationResult {
  playerId: string;
  point: Coordinates | null;
  correct: boolean;
}
export interface LocationView {
  draft: Coordinates | null;
  confirmed: boolean;
  reveal: { countryId: string; guesses: LocationResult[]; until: number } | null;
}
export function phasesFor(mode: RoomView['mode']) {
  return mode === 'duel' ? DUEL_PHASES : PHASES;
}
export interface Option {
  id: string;
  text: string;
}
export interface QuestionView {
  kind?: 'location';
  id: string;
  prompt: string;
  visual?: string;
  options: Option[];
  number: number;
  startedAt: number;
  deadline: number;
}
export interface Feedback {
  correct: boolean;
  timeout: boolean;
  correctOptionId: string;
  selectedId: string | null;
  responseMs: number;
}
export interface Statistics {
  correct: number;
  incorrect: number;
  timeouts: number;
  total: number;
  averageMs: number;
  accuracy: number;
  phases: number[];
}
export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  reconnectUntil: number | null;
  progress: number;
  phaseAnswers: boolean[];
  stats: Statistics;
  rematch: boolean;
}
export interface RoomSummary {
  id: string;
  mode: 'duel' | 'arena';
  host: string;
  count: number;
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  joinable: boolean;
}
export interface RoomView {
  id: string;
  mode: 'duel' | 'solo' | 'arena';
  hostId: string;
  state: 'waiting' | 'intro' | 'playing' | 'finished' | 'abandoned';
  phase: number;
  introEndsAt: number | null;
  players: PlayerView[];
  question: QuestionView | null;
  feedback: Feedback | null;
  location: LocationView | null;
  phaseComplete: boolean;
  winnerId: string | null;
  reason: string | null;
}
export interface Snapshot {
  serverNow: number;
  me: { id: string; name: string };
  rooms: RoomSummary[];
  room: RoomView | null;
}
export type Action =
  | { type: 'create' }
  | { type: 'solo' }
  | { type: 'arena' }
  | { type: 'join'; roomId: string }
  | { type: 'leave' }
  | { type: 'exit' }
  | { type: 'start' }
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'locate'; questionId: string; point: Coordinates }
  | { type: 'confirm-location'; questionId: string; point: Coordinates }
  | { type: 'rematch' };
export type Reply = { ok: true } | { ok: false; error: string };
