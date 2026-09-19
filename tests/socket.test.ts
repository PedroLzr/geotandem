import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../backend/server';
import type { Reply, Snapshot } from '../shared/types';
const until = (socket: Socket, predicate: (s: Snapshot) => boolean) =>
  new Promise<Snapshot>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('snapshot', listener);
      reject(new Error('Snapshot timed out'));
    }, 7000);
    const listener = (s: Snapshot) => {
      if (predicate(s)) {
        clearTimeout(timeout);
        socket.off('snapshot', listener);
        resolve(s);
      }
    };
    socket.on('snapshot', listener);
  });
const action = (socket: Socket, payload: unknown) =>
  new Promise<Reply>((resolve) => socket.emit('action', payload, resolve));
test('real sockets validate guests, broadcast rooms, reject a third player, conceal keys, and restore a refreshed session', async () => {
  const server = createApp();
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  const connect = (name: string, token?: string) => {
    const s = io(url, {
      auth: { name, token },
      forceNew: true,
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(s);
    return s;
  };
  try {
    const invalid = connect('<script>');
    const invalidError = new Promise<Error>((resolve) => invalid.once('connect_error', resolve));
    invalid.connect();
    assert.match((await invalidError).message, /valid guest name/);
    invalid.disconnect();
    const a = connect('Alex');
    let token = '';
    a.on('session', (session) => {
      token = session.token;
    });
    const aReady = until(a, () => true);
    a.connect();
    await aReady;
    const b = connect('Sam');
    const bReady = until(b, () => true);
    b.connect();
    await bReady;
    const roomAppears = until(b, (s) => s.rooms.length === 1);
    assert.deepEqual(await action(a, { type: 'create' }), { ok: true });
    const lobby = await roomAppears;
    const roomId = lobby.rooms[0].id;
    const both = until(a, (s) => s.room?.players.length === 2);
    assert.deepEqual(await action(b, { type: 'join', roomId }), { ok: true });
    await both;
    const c = connect('Third');
    const cReady = until(c, () => true);
    c.connect();
    await cReady;
    assert.equal((await action(c, { type: 'join', roomId })).ok, false);
    assert.equal((await action(b, { type: 'start' })).ok, false);
    assert.equal(
      (await action(a, { type: 'answer', questionId: 'bad', optionId: 'bad' })).ok,
      false,
    );
    const aq = until(a, (s) => !!s.room?.question);
    const bq = until(b, (s) => !!s.room?.question);
    await action(a, { type: 'start' });
    const [sa, sb] = await Promise.all([aq, bq]);
    assert.deepEqual(sa.room!.question, sb.room!.question);
    assert.equal(JSON.stringify(sa.room!.question).includes('correctOptionId'), false);
    const question = sa.room!.question!;
    const scored = until(b, (s) => s.room!.players[0].stats.total === 1);
    assert.equal(
      (
        await action(a, {
          type: 'answer',
          questionId: question.id,
          optionId: question.options[0].id,
        })
      ).ok,
      true,
    );
    const opponent = await scored;
    assert.equal(opponent.room!.feedback, null);
    assert.equal(
      (
        await action(a, {
          type: 'answer',
          questionId: question.id,
          optionId: question.options[1].id,
        })
      ).ok,
      false,
    );
    a.disconnect();
    const refreshed = connect('Alex', token);
    const restored = until(refreshed, (s) => !!s.room);
    refreshed.connect();
    const state = await restored;
    assert.equal(state.me.id, sa.me.id);
    assert.equal(state.room!.id, roomId);
    assert.equal(state.room!.players[0].stats.total, 1);
    await action(refreshed, { type: 'leave' });
  } finally {
    for (const s of sockets) s.disconnect();
    await server.close();
  }
});
