import { PORTALS } from '../game/constants';
import type { PlayerConfig } from '../game/useGame';

export interface AccessibleBoardTableProps {
  players: PlayerConfig[];
  positions: number[];
  currentTurn: number;
}

/**
 * Screen-reader accessible representation of the Snake & Ladder board.
 * Outlines player coordinates, ladders, and snakes without affecting visual canvas layout.
 */
export default function AccessibleBoardTable({
  players,
  positions,
  currentTurn,
}: AccessibleBoardTableProps) {
  // Map square -> list of players currently on that square
  const squareToPlayers = new Map<number, string[]>();
  players.forEach((p, idx) => {
    const pos = positions[idx] ?? 0;
    if (!squareToPlayers.has(pos)) {
      squareToPlayers.set(pos, []);
    }
    squareToPlayers.get(pos)!.push(p.name);
  });

  return (
    <section aria-label="Accessible Game Board Overview" className="sr-only">
      <h2>Snake &amp; Ladder Board Status</h2>
      <p>
        Current Turn: {players[currentTurn]?.name ?? 'None'} (Player {(players[currentTurn]?.slotIndex ?? 0) + 1})
      </p>

      <h3>Player Locations</h3>
      <ul>
        {players.map((p, idx) => {
          const pos = positions[idx] ?? 0;
          return (
            <li key={p.id}>
              {p.name}: {pos === 0 ? 'Start Bay (before square 1)' : `Square ${pos}`}
            </li>
          );
        })}
      </ul>

      <h3>Board Tiles (1 to 100)</h3>
      <table>
        <caption>Squares and Portals</caption>
        <thead>
          <tr>
            <th scope="col">Square</th>
            <th scope="col">Portal</th>
            <th scope="col">Players Present</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 100 }, (_, i) => 100 - i).map((sq) => {
            const portal = PORTALS[sq];
            const occupants = squareToPlayers.get(sq);
            let portalDesc = 'Regular square';
            if (portal?.type === 'snake') {
              portalDesc = `Snake drops down to ${portal.to}`;
            } else if (portal?.type === 'ladder') {
              portalDesc = `Ladder climbs up to ${portal.to}`;
            } else if (sq === 100) {
              portalDesc = 'Finish podium (winning square)';
            }

            return (
              <tr key={sq}>
                <th scope="row">{sq}</th>
                <td>{portalDesc}</td>
                <td>{occupants && occupants.length > 0 ? occupants.join(', ') : 'None'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
