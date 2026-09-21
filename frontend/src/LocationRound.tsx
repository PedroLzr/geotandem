import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import world from '../../data/location-map.json';
import { LOCATION_MS, type Action, type Coordinates, type RoomView } from '../../shared/types';
import './location.css';

const projection = geoEquirectangular()
  .scale(1000 / (2 * Math.PI))
  .translate([500, 300]);
const path = geoPath(projection);
const features = (world as FeatureCollection<Polygon | MultiPolygon>).features;
const outlines = features.map((f) => ({ id: String(f.id), path: path(f) ?? '' }));
const World = memo(function World({ countryId }: { countryId?: string }) {
  return (
    <g className={countryId ? 'location-world revealed' : 'location-world'}>
      {outlines.map((f) => (
        <path
          key={f.id}
          d={f.path}
          className={f.id === countryId ? 'location-country-reveal' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
});
type View = { x: number; y: number; k: number };
const initialView: View = { x: 0, y: 0, k: 1 };
function bound(v: View): View {
  return {
    k: v.k,
    x: Math.max(1000 * (1 - v.k), Math.min(0, v.x)),
    y: Math.max(600 * (1 - v.k), Math.min(0, v.y)),
  };
}
function zoom(v: View, factor: number, x = 500, y = 300): View {
  const k = Math.max(1, Math.min(16, v.k * factor));
  return bound({ k, x: x - ((x - v.x) * k) / v.k, y: y - ((y - v.y) * k) / v.k });
}
function svgPoint(svg: SVGSVGElement, x: number, y: number): Coordinates {
  const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
  return [point.x, point.y];
}

export default function LocationRound({
  room,
  meId,
  now,
  connected,
  busy,
  send,
}: {
  room: RoomView;
  meId: string;
  now: number;
  connected: boolean;
  busy: boolean;
  send: (action: Action) => void;
}) {
  const question = room.question!;
  const location = room.location!;
  const [draft, setDraft] = useState<Coordinates | null>(location.draft);
  const [view, setView] = useState(initialView);
  const [markerRadius, setMarkerRadius] = useState(20);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Coordinates>());
  const gesture = useRef({ start: [0, 0] as Coordinates, moved: false });
  const timeLeft = Math.max(0, question.deadline - now);
  const revealed = location.reveal;
  const countryId = revealed?.countryId;
  const revealUntil = revealed?.until;
  const locked = location.confirmed || !!revealed || timeLeft === 0 || !connected;
  const ownResult = revealed?.guesses.find((g) => g.playerId === meId);
  const selected = locked ? location.draft : draft;
  const choose = useCallback(
    (point: Coordinates) => {
      if (locked) return;
      setDraft(point);
      send({ type: 'locate', questionId: question.id, point });
    },
    [locked, question.id, send],
  );
  const countryView = useMemo(() => {
    if (!countryId) return initialView;
    const country = features.find((f) => f.id === countryId)!;
    const [[x0, y0], [x1, y1]] = path.bounds(country);
    const k = Math.max(1, Math.min(10, 0.7 / Math.max((x1 - x0) / 1000, (y1 - y0) / 600)));
    return bound({ k, x: 500 - ((x0 + x1) / 2) * k, y: 300 - ((y0 + y1) / 2) * k });
  }, [countryId]);
  const revealPoints =
    revealed?.guesses
      .filter((guess) => guess.point)
      .map((guess) => guess.point!.join(','))
      .join(',') ?? '';
  const revealView = useMemo(() => {
    if (!countryId) return initialView;
    const [[left, top], [right, bottom]] = path.bounds(features.find((f) => f.id === countryId)!);
    let x0 = left,
      y0 = top,
      x1 = right,
      y1 = bottom;
    const coordinates = revealPoints ? revealPoints.split(',').map(Number) : [];
    for (let i = 0; i < coordinates.length; i += 2) {
      const [x, y] = projection([coordinates[i], coordinates[i + 1]])!;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const k = Math.max(1, Math.min(10, 0.7 / Math.max((x1 - x0) / 1000, (y1 - y0) / 600)));
    return bound({ k, x: 500 - ((x0 + x1) / 2) * k, y: 300 - ((y0 + y1) / 2) * k });
  }, [countryId, revealPoints]);
  useEffect(() => {
    // Frame the country and all guesses together; keep small targets readable.
    if (revealUntil) setView(revealView);
  }, [revealUntil, revealView]);
  useEffect(() => {
    const element = svg.current!;
    const resize = new ResizeObserver(() => {
      const scale = element.getScreenCTM()?.a ?? 1;
      if (scale > 0) setMarkerRadius(Math.max(20, 14 / scale));
    });
    resize.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const [x, y] = svgPoint(element, event.clientX, event.clientY);
      setView((v) => zoom(v, Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.006), x, y));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      resize.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, []);
  const confirm = () => {
    if (draft && !locked) send({ type: 'confirm-location', questionId: question.id, point: draft });
  };
  const markers = revealed
    ? revealed.guesses
        .filter((g) => g.point)
        .map((g) => ({ ...g, point: g.point!, own: g.playerId === meId }))
        .sort((a, b) => Number(b.own) - Number(a.own))
    : selected
      ? [{ playerId: meId, point: selected, own: true, correct: null }]
      : [];
  const placed: Coordinates[] = [];
  const markerLayout = markers.map((marker) => {
    const projected = projection(marker.point)!;
    const anchor: Coordinates = [projected[0] * view.k + view.x, projected[1] * view.k + view.y];
    let [x, y] = anchor;
    // Separate overlapping badges, with a leader back to the actual guess.
    if (revealed) {
      for (let attempt = 0; attempt < 129; attempt++) {
        const radius = attempt === 0 ? 0 : Math.ceil(attempt / 16) * (markerRadius * 2 + 8);
        const angle = ((attempt - 1) % 16) * (Math.PI / 8);
        const inset = markerRadius + 4;
        x = Math.max(inset, Math.min(1000 - inset, anchor[0] + Math.cos(angle) * radius));
        y = Math.max(inset, Math.min(600 - inset, anchor[1] + Math.sin(angle) * radius));
        if (placed.every(([px, py]) => Math.hypot(x - px, y - py) >= markerRadius * 2 + 4)) break;
      }
    }
    placed.push([x, y]);
    const name = room.players.find((p) => p.id === marker.playerId)?.name ?? 'Explorer';
    return {
      ...marker,
      x,
      y,
      anchor,
      name,
      initial: Array.from(name.trim())[0]?.toUpperCase() ?? '?',
    };
  });
  return (
    <div className="location-round" data-question-id={question.id}>
      <div className="question-top">
        <span className="eyebrow">
          LOCATION <strong>{String(question.number).padStart(2, '0')}</strong> / 10
        </span>
        <div
          className={`timer ${timeLeft <= 3000 && !revealed ? 'urgent' : ''}`}
          role="timer"
          aria-label={`${Math.ceil(timeLeft / 1000)} seconds remaining`}
        >
          <Clock3 size={18} />
          <strong>{revealed ? '✓' : Math.ceil(timeLeft / 1000)}</strong>
          {!revealed && <span>s</span>}
        </div>
      </div>
      <div className="timer-track">
        <div style={{ width: `${revealed ? 0 : (timeLeft / LOCATION_MS) * 100}%` }} />
      </div>
      <h1 className="question-prompt">{question.prompt}</h1>
      <div className="location-map">
        <svg
          ref={svg}
          viewBox="0 0 1000 600"
          role="application"
          aria-label="World map. Tap to place your marker. Use arrow keys to move it, plus and minus to zoom, and Enter to confirm."
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const point = svgPoint(e.currentTarget, e.clientX, e.clientY);
            pointers.current.set(e.pointerId, point);
            gesture.current = { start: point, moved: pointers.current.size > 1 };
          }}
          onPointerMove={(e) => {
            const previous = pointers.current.get(e.pointerId);
            if (!previous) return;
            const next = svgPoint(e.currentTarget, e.clientX, e.clientY);
            const oldPoints = [...pointers.current.values()];
            pointers.current.set(e.pointerId, next);
            const points = [...pointers.current.values()];
            if (points.length === 2) {
              gesture.current.moved = true;
              const oldDistance = Math.hypot(
                oldPoints[0][0] - oldPoints[1][0],
                oldPoints[0][1] - oldPoints[1][1],
              );
              const distance = Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
              if (oldDistance > 0)
                setView((v) =>
                  zoom(
                    v,
                    distance / oldDistance,
                    (points[0][0] + points[1][0]) / 2,
                    (points[0][1] + points[1][1]) / 2,
                  ),
                );
            } else if (points.length === 1) {
              if (
                Math.hypot(next[0] - gesture.current.start[0], next[1] - gesture.current.start[1]) >
                8
              )
                gesture.current.moved = true;
              if (gesture.current.moved)
                setView((v) =>
                  bound({ ...v, x: v.x + next[0] - previous[0], y: v.y + next[1] - previous[1] }),
                );
            }
          }}
          onPointerUp={(e) => {
            if (!pointers.current.has(e.pointerId)) return;
            if (pointers.current.size === 1 && !gesture.current.moved && !locked) {
              const [x, y] = svgPoint(e.currentTarget, e.clientX, e.clientY);
              const point = projection.invert!([
                (x - view.x) / view.k,
                (y - view.y) / view.k,
              ]) as Coordinates;
              if (Math.abs(point[1]) <= 90)
                choose([Math.max(-180, Math.min(180, point[0])), point[1]]);
            }
            pointers.current.delete(e.pointerId);
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            gesture.current.moved = true;
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              const point = selected ?? [0, 0];
              const step = e.shiftKey ? 5 : 1;
              choose([
                Math.max(
                  -180,
                  Math.min(
                    180,
                    point[0] + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
                  ),
                ),
                Math.max(
                  -90,
                  Math.min(
                    90,
                    point[1] + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0),
                  ),
                ),
              ]);
            } else if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              setView((v) => zoom(v, 1.6));
            } else if (e.key === '-') {
              e.preventDefault();
              setView((v) => zoom(v, 1 / 1.6));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <World countryId={revealed?.countryId} />
            {revealed && (
              <path
                className="location-country-outline"
                d={outlines.find((f) => f.id === revealed.countryId)?.path}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
          {markerLayout.map((marker) => (
            <line
              key={marker.playerId}
              className="location-marker-leader"
              x1={marker.anchor[0]}
              y1={marker.anchor[1]}
              x2={marker.x}
              y2={marker.y}
            />
          ))}
          {markerLayout.map((marker) => {
            const label = `${marker.own ? 'You' : marker.name}${revealed ? `: ${marker.correct ? 'Correct' : 'Incorrect'}` : ': Selected location'}`;
            return (
              <g
                key={marker.playerId}
                className={`location-marker ${marker.own ? `own${revealed ? (marker.correct ? ' correct' : ' incorrect') : ''}` : 'rival'}`}
                transform={`translate(${marker.x} ${marker.y})`}
                role="img"
                aria-label={label}
              >
                <title>
                  {marker.name} · {label}
                </title>
                <circle r={revealed ? markerRadius : 20} vectorEffect="non-scaling-stroke" />
                {revealed ? (
                  <text textAnchor="middle" dy="0.35em" style={{ fontSize: markerRadius * 1.1 }}>
                    {marker.initial}
                  </text>
                ) : (
                  <path d="M-8,0 H8 M0,-8 V8" vectorEffect="non-scaling-stroke" />
                )}
              </g>
            );
          })}
        </svg>
        <div className="location-map-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => setView((v) => zoom(v, 1.6))}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => setView((v) => zoom(v, 1 / 1.6))}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Show whole world"
            onClick={() => setView(initialView)}
          >
            <RotateCcw size={16} />
          </button>
          {revealed && (
            <button
              type="button"
              className="icon-button"
              aria-label="Zoom to highlighted country"
              onClick={() => setView(countryView)}
            >
              <Crosshair size={18} />
            </button>
          )}
        </div>
      </div>
      {revealed ? (
        <div className="location-reveal" role="status">
          <strong className={ownResult?.correct ? 'correct-text' : ''}>
            {ownResult?.correct ? '✓ CORRECT' : '✕ INCORRECT'}
          </strong>
          <div className="location-outcomes">
            {revealed.guesses.map((guess) => (
              <span
                key={guess.playerId}
                className={
                  guess.playerId === meId
                    ? `own ${guess.correct ? 'correct' : 'incorrect'}`
                    : 'rival'
                }
              >
                <i />
                {guess.playerId === meId
                  ? 'You'
                  : room.players.find((p) => p.id === guess.playerId)?.name}
                :{' '}
                <strong>
                  {guess.correct ? '✓ Correct' : guess.point ? '✕ Incorrect' : '✕ No marker'}
                </strong>
              </span>
            ))}
          </div>
          <span className="location-country-key">
            <i />
            {question.prompt.replace(/^Locate /, '')} highlighted · Next round in{' '}
            {Math.max(1, Math.ceil((revealed.until - now) / 1000))}s
          </span>
        </div>
      ) : (
        <div className="location-actions">
          <span role="status">
            {location.confirmed
              ? room.mode === 'arena'
                ? 'Waiting for the other players…'
                : room.mode === 'solo'
                  ? 'Location confirmed'
                  : 'Waiting for your rival…'
              : selected
                ? 'Auto-confirms at 0s'
                : 'Tap the map to place your marker'}
          </span>
          <button className="button primary" disabled={locked || busy || !draft} onClick={confirm}>
            <Check size={17} />
            {location.confirmed ? 'Confirmed' : 'Confirm location'}
          </button>
        </div>
      )}
    </div>
  );
}
