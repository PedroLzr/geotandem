import { ArrowRight, ChevronDown, Clock3, RotateCcw, Trophy } from 'lucide-react';
import { ARENA_CAPACITY, PHASES, type RoomView } from '../../shared/types';
import { arenaRanking } from '../../shared/ranking';
import { RoomInvitation } from './RoomInvitation';

type ArenaProps = { room: RoomView; meId: string };

export function ArenaWaiting({
  room,
  meId,
  busy,
  onStart,
}: ArenaProps & { busy: boolean; onStart: () => void }) {
  return (
    <section className="panel arena-waiting">
      <div className="arena-heading">
        <div>
          <span className="eyebrow">ARENA {room.id}</span>
          <h1>
            Explorers{' '}
            <span>
              {room.players.length}/{ARENA_CAPACITY}
            </span>
          </h1>
        </div>
        {room.players.length < ARENA_CAPACITY && (
          <RoomInvitation roomId={room.id} disabled={busy} />
        )}
      </div>
      <ul className="arena-roster">
        {room.players.map((p) => (
          <li key={p.id}>
            <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
            <span className="arena-name">
              {p.name}
              {p.id === meId && <small> YOU</small>}
            </span>
            <span className="arena-player-status">
              <span className={`status-dot ${p.connected ? '' : 'offline'}`} />
              {!p.connected ? 'Reconnecting' : p.id === room.hostId ? 'Host' : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="arena-start">
        {room.hostId === meId ? (
          <button
            className="button primary"
            onClick={onStart}
            disabled={busy || room.players.length < 2 || room.players.some((p) => !p.connected)}
          >
            Start arena <ArrowRight size={18} />
          </button>
        ) : (
          <span className="waiting-note">
            <Clock3 size={16} /> Waiting for the host
          </span>
        )}
      </div>
    </section>
  );
}

function ArenaStandings({ room, meId, final = false }: ArenaProps & { final?: boolean }) {
  return (
    <table className="arena-standings">
      <caption className="sr-only">
        {final ? 'Final arena standings' : 'Live arena standings'}
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Position</span>#
          </th>
          <th scope="col">Explorer</th>
          <th scope="col">Correct</th>
          {final && <th scope="col">Avg. time</th>}
        </tr>
      </thead>
      <tbody>
        {arenaRanking(room.players).map(({ player: p, rank }) => (
          <tr key={p.id} className={p.id === meId ? 'arena-own-row' : ''}>
            <td>{rank}</td>
            <th scope="row">
              <span>{p.name}</span>
              {p.id === meId && <small>YOU</small>}
              {!final && !p.connected && <span className="sr-only">Reconnecting</span>}
            </th>
            <td>
              {p.stats.correct}
              {final && <small> / {PHASES.length * 10}</small>}
            </td>
            {final && <td>{(p.stats.averageMs / 1000).toFixed(2)}s</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ArenaScoreboard({ room, meId }: ArenaProps) {
  const own = arenaRanking(room.players).find(({ player }) => player.id === meId)!;
  return (
    <aside className="arena-scoreboard panel" aria-label="Arena leaderboard">
      <div className="arena-desktop-standings">
        <h2>Leaderboard</h2>
        <ArenaStandings room={room} meId={meId} />
      </div>
      <details className="arena-mobile-standings">
        <summary>
          <span>
            <strong>#{own.rank}</strong> of {room.players.length}
          </span>
          <span>
            Leaderboard <ChevronDown size={15} />
          </span>
        </summary>
        <ArenaStandings room={room} meId={meId} />
      </details>
    </aside>
  );
}

export function ArenaResults({
  room,
  meId,
  busy,
  onRematch,
  onLeave,
}: ArenaProps & { busy: boolean; onRematch: () => void; onLeave: () => void }) {
  const own = room.players.find((p) => p.id === meId)!;
  const winner = room.players.find((p) => p.id === room.winnerId);
  return (
    <section className="results arena-results">
      <div className="results-heading">
        <span className="trophy-badge">
          <Trophy size={35} />
        </span>
        <p className="eyebrow">ARENA COMPLETE</p>
        <h1>{winner ? `${winner.name} wins the arena.` : 'A shared victory.'}</h1>
      </div>
      <div className="panel">
        <ArenaStandings room={room} meId={meId} final />
      </div>
      <details className="panel arena-personal-stats">
        <summary>
          Your expedition <ChevronDown size={16} />
        </summary>
        <dl>
          <div>
            <dt>Accuracy</dt>
            <dd>{own.stats.accuracy.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Incorrect</dt>
            <dd>{own.stats.incorrect}</dd>
          </div>
          <div>
            <dt>Timeouts</dt>
            <dd>{own.stats.timeouts}</dd>
          </div>
          {PHASES.map((phase, index) => (
            <div key={phase}>
              <dt>{phase}</dt>
              <dd>{own.stats.phases[index]} / 10</dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="results-actions">
        {room.hostId === meId ? (
          <button className="button primary" disabled={busy} onClick={onRematch}>
            <RotateCcw size={17} /> Play again
          </button>
        ) : (
          <span className="waiting-note">Waiting for the host</span>
        )}
        <button className="button secondary" disabled={busy} onClick={onLeave}>
          Back to Game Rooms <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
