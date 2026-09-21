import { useEffect, useState } from 'react';
import { Check, Share2 } from 'lucide-react';

export function RoomInvitation({ roomId, disabled }: { roomId: string; disabled: boolean }) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'copied' | 'manual'>('idle');
  const url = new URL('/', window.location.origin);
  url.searchParams.set('room', roomId);
  const link = url.href;
  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  const share = async () => {
    setStatus('sharing');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'GeoTandem', text: 'Join my expedition!', url: link });
        setStatus('idle');
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setStatus('idle');
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      setStatus('manual');
    }
  };
  return (
    <div className="room-invitation">
      <button
        className="invite-button"
        onClick={share}
        disabled={disabled || status === 'sharing'}
        title="Share room invitation"
      >
        {status === 'copied' ? <Check size={15} /> : <Share2 size={15} />}
        <span aria-live="polite">{status === 'copied' ? 'Link copied' : 'Invite a friend'}</span>
      </button>
      {status === 'manual' && (
        <input
          className="invitation-link"
          aria-label="Copy this invitation link"
          value={link}
          readOnly
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
