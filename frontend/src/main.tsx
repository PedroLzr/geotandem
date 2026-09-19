import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  Flag,
  Globe2,
  LogOut,
  Map,
  MapPin,
  Plus,
  RotateCcw,
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  PHASES,
  INSTRUCTIONS,
  QUESTION_MS,
  type Action,
  type Reply,
  type RoomView,
  type Snapshot,
} from '../../shared/types';
import './styles.css';
const phaseIcons = [Map, Flag, MapPin];
function readGuest(): { name: string; token?: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem('geotandem.guest') ?? 'null');
  } catch {
    return null;
  }
}
function saveGuest(guest: { name: string; token?: string }) {
  try {
    sessionStorage.setItem('geotandem.guest', JSON.stringify(guest));
  } catch {
    /* The current session still works when storage is unavailable. */
  }
}
function App() {
  const [guest, setGuest] = useState(readGuest);
  const [name, setName] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const socket = useRef<Socket | null>(null);
  const offset = useRef(0);
  const synced = useRef(false);
  const lockedQuestion = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 75);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!guest) return;
    const connection = io({ auth: guest, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    socket.current = connection;
    const sync = () => {
      const start = Date.now();
      connection.timeout(3000).emit('clock', (err: Error | null, serverTime: number) => {
        if (!err) {
          offset.current = serverTime - (start + Date.now()) / 2;
          synced.current = true;
        }
      });
    };
    connection.on('connect', () => {
      setConnected(true);
      setError('');
      sync();
    });
    connection.on('disconnect', () => {
      setConnected(false);
      setBusy(false);
      lockedQuestion.current = null;
    });
    connection.on('connect_error', (err: Error) => {
      setConnected(false);
      setError(
        err.message === 'xhr poll error'
          ? 'Unable to reach the game server. Reconnecting…'
          : err.message,
      );
    });
    connection.on('session', ({ token }: { token: string }) => {
      connection.auth = { ...guest, token };
      saveGuest({ ...guest, token });
    });
    connection.on('snapshot', (state: Snapshot) => {
      if (!synced.current) offset.current = state.serverNow - Date.now();
      setSnapshot(state);
      setBusy(false);
      if (lockedQuestion.current !== state.room?.question?.id || state.room?.feedback)
        lockedQuestion.current = null;
    });
    connection.on('replaced', () => {
      setError('This guest session was opened in another tab. Reload to reconnect here.');
    });
    const timer = setInterval(sync, 15_000);
    return () => {
      clearInterval(timer);
      connection.disconnect();
      socket.current = null;
      synced.current = false;
    };
  }, [guest]);
  useEffect(() => {
    if (leaveConfirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [leaveConfirm]);
  const send = useCallback((action: Action) => {
    if (!socket.current?.connected) return;
    if (action.type === 'answer') {
      if (lockedQuestion.current === action.questionId) return;
      lockedQuestion.current = action.questionId;
    }
    setBusy(true);
    setError('');
    socket.current.timeout(5000).emit('action', action, (err: Error | null, response: Reply) => {
      setBusy(false);
      if (err || !response?.ok) {
        lockedQuestion.current = null;
        setError(
          err
            ? 'The request could not be confirmed. Reconnecting will restore your game.'
            : response && !response.ok
              ? response.error
              : 'Unable to process the request.',
        );
      }
    });
  }, []);
  const room = snapshot?.room;
  const me = snapshot?.me;
  const feedback = room?.feedback;
  const question = room?.question;
  const timeLeft = question ? Math.max(0, question.deadline - now) : 0;
  const closeDialog = () => {
    setLeaveConfirm(false);
  };
  const leave = () => {
    send({ type: 'leave' });
    setLeaveConfirm(false);
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="GeoTandem home">
          <span className="brand-icon">
            <Compass size={25} />
          </span>
          Geo<span>Tandem</span>
        </a>
        <div className="header-actions">
          {guest && (
            <div className="guest-chip">
              <span className={`status-dot ${connected ? '' : 'offline'}`} />
              <span>{me?.name ?? guest.name}</span>
              <span className="guest-label">GUEST</span>
            </div>
          )}
        </div>
      </header>
      <main id="main-content">
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={18} />
            </button>
          </div>
        )}
        {guest && !connected && (
          <div className="connection-banner" role="status">
            <WifiOff size={17} /> Reconnecting to GeoTandem… Your progress is saved during the
            45-second grace period.
          </div>
        )}
        {!guest ? (
          <section className="welcome">
            <div className="welcome-copy">
              <h1>
                A whole world.
                <br />
                One worthy <em>rival.</em>
              </h1>
              <div className="hero-facts">
                <span>
                  <Users size={16} /> 2 players
                </span>
                <span>
                  <Globe2 size={16} /> 30 questions
                </span>
                <span>
                  <Clock3 size={16} /> 10 seconds each
                </span>
              </div>
              <div className="globe-art">
                <img
                  src="/globe.svg"
                  alt="Illustration of Earth with an orbit around Europe and Africa"
                />
                <div className="globe-note">
                  <Compass size={20} />
                  <span>
                    A WORLD WORTH KNOWING
                    <br />
                    <strong>An adventure worth sharing.</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="welcome-right">
              <section className="entry-card">
                <div className="entry-icon">
                  <Compass size={31} />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = name.trim();
                    if (!/^[\p{L}\p{N} ._'’-]{1,24}$/u.test(value)) {
                      setError('Choose a name with 1–24 letters, numbers, or simple punctuation.');
                      return;
                    }
                    const valueGuest = { name: value };
                    saveGuest(valueGuest);
                    setGuest(valueGuest);
                  }}
                >
                  <label htmlFor="guest-name">Your explorer name</label>
                  <input
                    id="guest-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pedro the best"
                    autoComplete="nickname"
                    maxLength={24}
                    required
                  />
                  <button className="button primary full" type="submit">
                    Enter the lobby <ArrowRight size={18} />
                  </button>
                </form>
              </section>
              <div className="route-preview">
                <span className="eyebrow">THREE WAYS TO KNOW THE WORLD</span>
                {PHASES.map((phase, i) => {
                  const Icon = phaseIcons[i];
                  return (
                    <div className="route-step" key={phase}>
                      <span className="route-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <strong>{phase}</strong>
                        <span>
                          {
                            [
                              'Recognize the outline.',
                              'Find the familiar colors.',
                              'Name the heart of a nation.',
                            ][i]
                          }
                        </span>
                      </div>
                      <span className="route-number">0{i + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : !snapshot ? (
          <section className="center-state">
            <Compass className="spin" size={40} />
            <h1>Finding your bearings…</h1>
            <p>Connecting you to the lobby.</p>
          </section>
        ) : !room ? (
          <>
            <div className="page-heading">
              <div>
                <h1>Join an open table, or start a journey of your own.</h1>
              </div>
              <button
                className="button primary"
                disabled={busy || !connected}
                onClick={() => send({ type: 'create' })}
              >
                <Plus size={18} /> Create Game
              </button>
            </div>
            <div className="lobby-layout">
              <section className="panel rooms-panel">
                <div className="panel-heading">
                  <h2>
                    Game rooms <span className="count-pill">{snapshot.rooms.length}</span>
                  </h2>
                </div>
                {snapshot.rooms.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Map size={42} />
                    </div>
                    <h3>The world is wide open.</h3>
                    <p>
                      Be the first to put a room on the map.
                      <br />
                      Your next rival is just around the corner.
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy || !connected}
                      onClick={() => send({ type: 'create' })}
                    >
                      Create the first game <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="room-list">
                    {snapshot.rooms.map((r) => (
                      <article className="room-row" key={r.id}>
                        <div className="avatar">{r.host.slice(0, 1).toUpperCase()}</div>
                        <div className="room-description">
                          <h3>{r.host}’s expedition</h3>
                          <p>
                            ROOM {r.id} <span>·</span>{' '}
                            {r.status === 'waiting'
                              ? 'Waiting for a rival'
                              : r.status === 'ready'
                                ? 'Ready to start'
                                : r.status === 'finished'
                                  ? 'Match complete'
                                  : 'Exploring the world'}
                          </p>
                        </div>
                        <span className="occupancy">
                          <Users size={16} />
                          {r.count}/2
                        </span>
                        <button
                          className={`button ${r.joinable ? 'secondary' : 'muted-button'}`}
                          disabled={!r.joinable || busy || !connected}
                          onClick={() => send({ type: 'join', roomId: r.id })}
                        >
                          {r.joinable ? 'Join game' : r.status === 'playing' ? 'In game' : 'Full'}
                          {r.joinable && <ArrowRight size={16} />}
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <aside className="field-guide">
                <span className="eyebrow">THE FIELD GUIDE</span>
                <h2>
                  Small rounds.
                  <br />
                  Big discoveries.
                </h2>
                <p>
                  Two explorers. The same questions.
                  <br />A little race around the world.
                </p>
                {PHASES.map((p, i) => {
                  const Icon = phaseIcons[i];
                  return (
                    <div className="guide-phase" key={p}>
                      <Icon size={21} />
                      <div>
                        <strong>{p}</strong>
                        <span>10 questions · 10 seconds each</span>
                      </div>
                      <span>0{i + 1}</span>
                    </div>
                  );
                })}
                <div className="guide-tip">
                  <Compass size={20} />
                  <p>Explore at your pace. You’ll meet your rival at the end of each phase.</p>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <>
            <div className="match-topline">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  room.state === 'playing' || room.state === 'intro'
                    ? setLeaveConfirm(true)
                    : leave()
                }
              >
                <LogOut size={16} />
                {room.state === 'finished' || room.state === 'abandoned'
                  ? 'Back to Lobby'
                  : 'Leave Room'}
              </button>
            </div>
            {room.players.some((p) => p.id !== me?.id && !p.connected) && (
              <div className="connection-banner" role="status">
                <WifiOff size={18} />
                <span>
                  Opponent disconnected. Waiting for reconnection…{' '}
                  <strong>
                    {Math.max(
                      0,
                      Math.ceil(
                        ((room.players.find((p) => !p.connected)?.reconnectUntil ?? now) - now) /
                          1000,
                      ),
                    )}
                    s
                  </strong>
                  <small>Question timers continue while disconnected.</small>
                </span>
              </div>
            )}
            {room.state === 'waiting' ? (
              <section className="waiting-room panel">
                {room.players.length < 2 && (
                  <p>Your room is live in the lobby. Invite a friend to join GeoTandem.</p>
                )}
                <div className="duel-players">
                  {[0, 1].map((i) => {
                    const p = room.players[i];
                    return (
                      <div className={`duel-player ${p ? '' : 'open-seat'}`} key={i}>
                        <span className="avatar large">
                          {p ? p.name.slice(0, 1).toUpperCase() : <Users size={28} />}
                        </span>
                        <h3>{p?.name ?? 'An open seat'}</h3>
                        <span className="player-status">
                          {p ? (
                            <>
                              <span className={`status-dot ${p.connected ? '' : 'offline'}`} />
                              {p.connected
                                ? p.id === room.hostId
                                  ? 'Host · Ready'
                                  : 'Ready to explore'
                                : 'Reconnecting'}
                            </>
                          ) : (
                            'Waiting for an explorer…'
                          )}
                        </span>
                      </div>
                    );
                  })}
                  <span className="versus">VS</span>
                </div>
                {room.hostId === me?.id ? (
                  <button
                    className="button primary start-button"
                    disabled={
                      busy ||
                      !connected ||
                      room.players.length !== 2 ||
                      room.players.some((p) => !p.connected)
                    }
                    onClick={() => send({ type: 'start' })}
                  >
                    Start expedition <ArrowRight size={19} />
                  </button>
                ) : (
                  <div className="waiting-note">
                    <Clock3 size={17} /> Waiting for the host to start the match.
                  </div>
                )}
                <div className="waiting-facts">
                  3 phases <span>·</span> 30 questions <span>·</span> One friendly rivalry
                </div>
              </section>
            ) : room.state === 'abandoned' ? (
              <section className="panel center-state">
                <Compass size={46} />
                <h1>This expedition has ended.</h1>
                <p>{room.reason}</p>
                <button className="button primary" disabled={!connected || busy} onClick={leave}>
                  Find another rival <ArrowRight size={18} />
                </button>
              </section>
            ) : room.state === 'finished' ? (
              <Results
                room={room}
                meId={me!.id}
                busy={busy || !connected}
                onRematch={() => send({ type: 'rematch' })}
                onLeave={leave}
              />
            ) : (
              <>
                <div className="phase-track">
                  {PHASES.map((p, i) => {
                    const Icon = phaseIcons[i];
                    return (
                      <div
                        className={`phase-track-item ${i === room.phase ? 'active' : ''} ${i < room.phase ? 'complete' : ''}`}
                        key={p}
                      >
                        <span className="phase-track-icon">
                          {i < room.phase ? <Check size={18} /> : <Icon size={18} />}
                        </span>
                        <div>
                          <small>PHASE 0{i + 1}</small>
                          <strong>{p}</strong>
                        </div>
                        {i < 2 && <ChevronRight className="track-arrow" size={17} />}
                      </div>
                    );
                  })}
                </div>
                <div className="game-layout">
                  <section className="panel game-panel">
                    {room.state === 'intro' || room.phaseComplete ? (
                      <div className="phase-intro">
                        <span className="intro-symbol">
                          {room.phaseComplete ? (
                            <CheckCircle2 size={44} />
                          ) : (
                            (() => {
                              const Icon = phaseIcons[room.phase];
                              return <Icon size={44} />;
                            })()
                          )}
                        </span>
                        <p className="eyebrow">
                          {room.phaseComplete
                            ? `PHASE 0${room.phase + 1} COMPLETE`
                            : `PHASE 0${room.phase + 1} OF 03`}
                        </p>
                        <h1>
                          {room.phaseComplete
                            ? room.phase < 2
                              ? `Next Phase: ${PHASES[room.phase + 1]}`
                              : 'The finish line is in sight.'
                            : PHASES[room.phase]}
                        </h1>
                        <p>
                          {room.phaseComplete
                            ? room.phase < 2
                              ? `${INSTRUCTIONS[room.phase + 1]} You have 10 seconds per question.`
                              : 'Your expedition is complete. Your rival is on the way.'
                            : `${INSTRUCTIONS[room.phase]} You have 10 seconds per question.`}
                        </p>
                        {room.phaseComplete ? (
                          <div className="waiting-note">
                            <Clock3 size={18} /> Waiting for opponent…
                          </div>
                        ) : (
                          <>
                            <div className="countdown" aria-live="polite">
                              {Math.max(1, Math.ceil(((room.introEndsAt ?? now) - now) / 1000))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      question && (
                        <>
                          <div className="question-top" data-question-id={question.id}>
                            <span className="eyebrow">
                              QUESTION <strong>{String(question.number).padStart(2, '0')}</strong> /
                              10
                            </span>
                            <div
                              className={`timer ${timeLeft <= 3000 && !feedback ? 'urgent' : ''}`}
                              role="timer"
                              aria-label={`${Math.ceil(timeLeft / 1000)} seconds remaining`}
                            >
                              <Clock3 size={19} />
                              <strong>
                                {feedback
                                  ? (feedback.responseMs / 1000).toFixed(1)
                                  : (timeLeft / 1000).toFixed(1)}
                              </strong>
                              <span>s</span>
                            </div>
                          </div>
                          <div className="timer-track">
                            <div
                              className={timeLeft <= 3000 ? 'urgent' : ''}
                              style={{ width: `${feedback ? 0 : (timeLeft / QUESTION_MS) * 100}%` }}
                            />
                          </div>
                          <div
                            className={`question-visual ${room.phase === 2 ? 'capital-visual' : ''}`}
                          >
                            {question.visual ? (
                              <img
                                className={room.phase === 0 ? 'country-shape' : 'country-flag'}
                                src={question.visual}
                                alt={
                                  room.phase === 0
                                    ? 'Unlabeled country silhouette to identify'
                                    : 'Unlabeled national flag to identify'
                                }
                              />
                            ) : (
                              <>
                                <span className="capital-icon">
                                  <MapPin size={35} />
                                </span>
                              </>
                            )}
                          </div>
                          <h1 className="question-prompt">{question.prompt}</h1>
                          <div className="answers" aria-label="Answer choices">
                            {question.options.map((option) => {
                              const correct = feedback?.correctOptionId === option.id;
                              const wrong = feedback?.selectedId === option.id && !correct;
                              return (
                                <button
                                  key={option.id}
                                  className={`answer ${correct ? 'correct' : ''} ${wrong ? 'incorrect' : ''}`}
                                  disabled={!!feedback || busy || !connected || timeLeft <= 0}
                                  onClick={() =>
                                    send({
                                      type: 'answer',
                                      questionId: question.id,
                                      optionId: option.id,
                                    })
                                  }
                                >
                                  {(correct || wrong) && (
                                    <span className="answer-feedback-icon">
                                      {correct ? <Check size={17} /> : <X size={17} />}
                                    </span>
                                  )}
                                  <span>{option.text}</span>
                                  {correct && <span className="sr-only">Correct answer</span>}
                                  {wrong && <span className="sr-only">Incorrect answer</span>}
                                </button>
                              );
                            })}
                          </div>
                          <div className="question-footer" role="status">
                            {feedback && (
                              <span className={feedback.correct ? 'correct-text' : ''}>
                                {feedback.timeout
                                  ? 'TIMEOUT'
                                  : feedback.correct
                                    ? '✓ CORRECT'
                                    : '✕ INCORRECT'}{' '}
                                <span>· Next question coming up</span>
                              </span>
                            )}
                          </div>
                        </>
                      )
                    )}
                  </section>
                  <Scoreboard room={room} meId={me!.id} />
                </div>
              </>
            )}
          </>
        )}
      </main>
      <dialog
        aria-labelledby="dialog-title"
        ref={dialog}
        onCancel={closeDialog}
        onClick={(e) => {
          if (e.target === dialog.current) closeDialog();
        }}
      >
        <button
          className="dialog-close icon-button"
          aria-label="Close dialog"
          onClick={closeDialog}
        >
          <X />
        </button>
        <span className="eyebrow">END THIS EXPEDITION?</span>
        <h2 id="dialog-title">Leave the match?</h2>
        <p>Your opponent’s match will end too. You can always find a new rival in the lobby.</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={closeDialog}>
            Keep exploring
          </button>
          <button className="button primary" onClick={leave}>
            Leave Room
          </button>
        </div>
      </dialog>
    </div>
  );
}
function Scoreboard({ room, meId }: { room: RoomView; meId: string }) {
  return (
    <aside className="scoreboard">
      <section className="panel">
        <div className="panel-heading">
          <h2>Live standings</h2>
          <span className="status-dot" />
        </div>
        <div className="score-players">
          {room.players.map((p, i) => (
            <div className="score-player" key={p.id}>
              <div className="score-player-top">
                <span className={`avatar ${i === 1 ? 'clay' : ''}`}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h3>
                    {p.name} {p.id === meId && <small>YOU</small>}
                  </h3>
                  <span>
                    {p.connected
                      ? p.progress === 10
                        ? 'Phase complete'
                        : `${p.progress}/10 completed`
                      : 'Reconnecting…'}
                  </span>
                </div>
              </div>
              <div className="score-numbers">
                <div>
                  <strong>{p.stats.correct}</strong>
                  <span>
                    <Check size={13} /> Correct
                  </span>
                </div>
                <div>
                  <strong>{p.stats.incorrect}</strong>
                  <span>
                    <X size={13} /> Incorrect
                  </span>
                </div>
              </div>
              <div className="progress-dots" aria-label={`${p.progress} of 10 questions complete`}>
                {Array.from({ length: 10 }, (_, n) => (
                  <span key={n} className={n < p.progress ? 'filled' : ''} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
function Results({
  room,
  meId,
  busy,
  onRematch,
  onLeave,
}: {
  room: RoomView;
  meId: string;
  busy: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const own = room.players.find((p) => p.id === meId)!;
  const winner = room.players.find((p) => p.id === room.winnerId);
  return (
    <section className="results">
      <div className="results-heading">
        <span className="trophy-badge">
          <Trophy size={35} />
        </span>
        <p className="eyebrow">GEOTANDEM · MATCH COMPLETE</p>
        <h1>{winner ? `${winner.name} takes the world.` : 'A world-class draw.'}</h1>
        <p>
          {winner?.id === meId
            ? 'Well explored. That victory has your name on it.'
            : winner
              ? 'A worthy rival. A world of new discoveries.'
              : 'Two curious minds, perfectly matched.'}
        </p>
      </div>
      <div className="result-cards">
        {room.players.map((p) => (
          <article
            className={`panel result-card ${p.id === room.winnerId ? 'winning' : ''}`}
            key={p.id}
          >
            <div className="result-card-top">
              <span className="avatar large">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className="result-rank">
                {room.winnerId === null
                  ? 'DRAW'
                  : p.id === room.winnerId
                    ? '★ WINNER'
                    : 'RUNNER-UP'}
              </span>
            </div>
            <h2>
              {p.name} {p.id === meId && <small>YOU</small>}
            </h2>
            <div className="result-big">
              <strong>{p.stats.correct}</strong>
              <span>/ 30 correct</span>
            </div>
            <dl className="result-stats">
              <div>
                <dt>Incorrect</dt>
                <dd>{p.stats.incorrect}</dd>
              </div>
              <div>
                <dt>Timeouts</dt>
                <dd>{p.stats.timeouts}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{p.stats.accuracy.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Avg. response time</dt>
                <dd>{(p.stats.averageMs / 1000).toFixed(2)}s</dd>
              </div>
            </dl>
            <div className="phase-results">
              {PHASES.map((phase, i) => (
                <div key={phase}>
                  <span>{phase}</span>
                  <strong>
                    {p.stats.phases[i]}
                    <small> / 10</small>
                  </strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="results-actions">
        <button className="button primary" disabled={busy || own.rematch} onClick={onRematch}>
          <RotateCcw size={17} />
          {own.rematch ? 'Waiting for opponent…' : 'Play Again'}
        </button>
        <button className="button secondary" disabled={busy} onClick={onLeave}>
          Back to Lobby <ArrowRight size={17} />
        </button>
      </div>
      {room.players.some((p) => p.rematch && p.id !== meId) && (
        <p className="rematch-note" role="status">
          Your rival wants another round. Ready to explore again?
        </p>
      )}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
