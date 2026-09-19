import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { z } from 'zod';
import { GameEngine } from './engine';
import type { Reply } from '../shared/types';
const guestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[\p{L}\p{N} ._'’-]+$/u, 'Use letters, numbers, spaces, or simple punctuation.'),
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create') }),
  z.object({ type: z.literal('join'), roomId: z.string().regex(/^[A-F0-9]{6}$/) }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('rematch') }),
  z.object({
    type: z.literal('answer'),
    questionId: z.string().uuid(),
    optionId: z.string().uuid(),
  }),
]);
export function createApp() {
  const app = express();
  const http = createServer(app);
  const engine = new GameEngine();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(express.static(resolve('dist/public')));
  app.get('/', (_req, res) => res.sendFile(resolve('dist/public/index.html')));
  const origins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ipLimits = new Map<string, { start: number; count: number }>();
  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    serveClient: false,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (
        origin &&
        !(origins
          ? origins.includes(origin)
          : (() => {
              try {
                return new URL(origin).host === req.headers.host;
              } catch {
                return false;
              }
            })())
      )
        return callback('Origin is not allowed.', false);
      const ip = req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      let bucket = ipLimits.get(ip);
      if (!bucket || now - bucket.start >= 60_000) {
        bucket = { start: now, count: 0 };
        ipLimits.set(ip, bucket);
      }
      callback(null, ++bucket.count <= 80);
    },
  });
  const active = new Map<string, string>();
  const broadcast = () => {
    for (const [id, socketId] of active) io.to(socketId).emit('snapshot', engine.snapshot(id));
  };
  io.use((socket, next) => {
    const parsed = guestSchema.safeParse(socket.handshake.auth);
    if (!parsed.success) return next(new Error('Enter a valid guest name (1–24 characters).'));
    try {
      const p = engine.connect(parsed.data.name, parsed.data.token);
      socket.data.playerId = p.id;
      next();
    } catch (error) {
      next(new Error(error instanceof Error ? error.message : 'Unable to connect.'));
    }
  });
  io.on('connection', (socket) => {
    const id: string = socket.data.playerId;
    const previous = active.get(id);
    active.set(id, socket.id);
    if (previous) {
      io.to(previous).emit('replaced');
      io.sockets.sockets.get(previous)?.disconnect(true);
    }
    socket.emit('session', { token: engine.player(id).token });
    let allowance = 30;
    let refreshed = Date.now();
    const allow = () => {
      const now = Date.now();
      allowance = Math.min(30, allowance + (now - refreshed) / 200);
      refreshed = now;
      if (allowance < 1) return false;
      allowance--;
      return true;
    };
    socket.on('clock', (ack: unknown) => {
      if (allow() && typeof ack === 'function') ack(Date.now());
    });
    socket.on('action', (payload: unknown, ack: unknown) => {
      const reply = (r: Reply) => {
        if (typeof ack === 'function') ack(r);
      };
      if (!allow()) return reply({ ok: false, error: 'Too many requests. Please slow down.' });
      if (active.get(id) !== socket.id)
        return reply({ ok: false, error: 'This session is active in another tab.' });
      const parsed = actionSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'Invalid game request.' });
      try {
        const action = parsed.data;
        switch (action.type) {
          case 'create':
            engine.create(id);
            break;
          case 'join':
            engine.join(id, action.roomId);
            break;
          case 'leave':
            engine.leave(id);
            break;
          case 'start':
            engine.start(id);
            break;
          case 'rematch':
            engine.rematch(id);
            break;
          case 'answer':
            engine.answer(id, action.questionId, action.optionId);
            break;
        }
        reply({ ok: true });
      } catch (error) {
        reply({
          ok: false,
          error: error instanceof Error ? error.message : 'Unable to process your request.',
        });
      }
      broadcast();
    });
    socket.on('disconnect', () => {
      if (active.get(id) !== socket.id) return;
      active.delete(id);
      engine.disconnect(id);
      broadcast();
    });
    broadcast();
  });
  const ticker = setInterval(() => {
    if (engine.tick()) broadcast();
  }, 50);
  const cleanup = setInterval(() => {
    for (const [ip, value] of ipLimits) if (Date.now() - value.start > 60_000) ipLimits.delete(ip);
  }, 60_000);
  return {
    app,
    http,
    io,
    engine,
    close: async () => {
      clearInterval(ticker);
      clearInterval(cleanup);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
