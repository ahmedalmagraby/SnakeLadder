export interface AriaLiveAnnouncerProps {
  message: string;
  assertive?: boolean;
}

/**
 * Visually-hidden live region announcer for screen readers.
 * Announces turns, dice rolls, ladder climbs, snake drops, and match outcomes.
 */
export default function AriaLiveAnnouncer({
  message,
  assertive = false,
}: AriaLiveAnnouncerProps) {
  return (
    <div
      role="status"
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
