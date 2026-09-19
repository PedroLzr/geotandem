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
export interface Option {
  id: string;
  text: string;
}
export interface QuestionView {
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
  stats: Statistics;
  rematch: boolean;
}
export interface RoomSummary {
  id: string;
  host: string;
  count: number;
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  joinable: boolean;
}
export interface RoomView {
  id: string;
  hostId: string;
  state: 'waiting' | 'intro' | 'playing' | 'finished' | 'abandoned';
  phase: number;
  introEndsAt: number | null;
  players: PlayerView[];
  question: QuestionView | null;
  feedback: Feedback | null;
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
  | { type: 'join'; roomId: string }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'answer'; questionId: string; optionId: string }
  | { type: 'rematch' };
export type Reply = { ok: true } | { ok: false; error: string };
