import { useEffect, useState, type RefObject } from 'react';
import { Clock3 } from 'lucide-react';
import { LOCATION_MS, QUESTION_MS, type Feedback, type QuestionView } from '../../shared/types';

function useServerTime(offset: RefObject<number>, running = true, interval = 75) {
  const [now, setNow] = useState(() => Date.now() + offset.current);
  useEffect(() => {
    if (!running) return;
    const update = () => setNow(Date.now() + offset.current);
    update();
    const timer = setInterval(update, interval);
    return () => clearInterval(timer);
  }, [offset, running, interval]);
  return now;
}

// Only expiration changes the controls; clock ticks stay inside the clock components.
export function useExpired(deadline: number | undefined, offset: RefObject<number>) {
  const [expiredDeadline, setExpiredDeadline] = useState<number>();
  useEffect(() => {
    if (deadline === undefined) return;
    const timer = setTimeout(
      () => setExpiredDeadline(deadline),
      Math.max(0, deadline - Date.now() - offset.current),
    );
    return () => clearTimeout(timer);
  }, [deadline, offset]);
  return (
    deadline !== undefined &&
    (expiredDeadline === deadline || Date.now() + offset.current >= deadline)
  );
}

export function Countdown({
  deadline,
  offset,
  minimum = 0,
}: {
  deadline?: number;
  offset: RefObject<number>;
  minimum?: number;
}) {
  const now = useServerTime(offset, deadline !== undefined, 250);
  return <>{Math.max(minimum, Math.ceil(((deadline ?? now) - now) / 1000))}</>;
}

export function QuestionClock({
  question,
  offset,
  feedback,
  revealed = false,
}: {
  question: QuestionView;
  offset: RefObject<number>;
  feedback?: Feedback | null;
  revealed?: boolean;
}) {
  const now = useServerTime(offset, !feedback && !revealed);
  const timeLeft = Math.max(0, question.deadline - now);
  const location = question.kind === 'location';
  const completed = !!feedback || revealed;
  const urgent = timeLeft <= 3000 && !completed;
  return (
    <>
      <div className="question-top" data-question-id={question.id}>
        <span className="eyebrow">
          {location ? 'LOCATION' : 'QUESTION'}{' '}
          <strong>{String(question.number).padStart(2, '0')}</strong> / 10
        </span>
        <div
          className={`timer ${urgent ? 'urgent' : ''}`}
          role="timer"
          aria-label={`${Math.ceil(timeLeft / 1000)} seconds remaining`}
        >
          <Clock3 size={19} />
          <strong>
            {revealed
              ? '✓'
              : feedback
                ? (feedback.responseMs / 1000).toFixed(1)
                : location
                  ? Math.ceil(timeLeft / 1000)
                  : (timeLeft / 1000).toFixed(1)}
          </strong>
          {!revealed && <span>s</span>}
        </div>
      </div>
      <div className="timer-track">
        <div
          className={urgent ? 'urgent' : ''}
          style={{
            width: `${completed ? 0 : (timeLeft / (location ? LOCATION_MS : QUESTION_MS)) * 100}%`,
          }}
        />
      </div>
    </>
  );
}
