# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting form:
**Security → Report a vulnerability** on this repository, or email the maintainer.

Include what you found, how to reproduce it, and the impact you believe it has.
You can expect an acknowledgement within a few days.

## Threat model

Snake & Ladder is a peer-to-peer game. There is no server holding user data and
no account system, so the assets at risk are small but not zero:

| Asset | Where it lives | Notes |
|---|---|---|
| Reconnect token | `localStorage`, per browser | The sole bearer credential for a reserved seat. Grants the ability to reclaim a specific seat and colour in a specific room. |
| Room roster | `localStorage` (host only) | Includes every guest's name, colour and slot. |
| Room code | URL fragment + PeerJS peer id | Addresses the room on the public PeerJS broker. Not a secret; treat it as a room name, not a password. |
| Game state | memory + `localStorage` | No personal data beyond the names players type in. |

**Out of scope:** the game collects no analytics, has no accounts, no payments,
and no server-side storage. There is no database to exfiltrate.

## Known and accepted limitations

These are architectural, not bugs, and are documented rather than fixed:

- **Signalling transits the public `0.peerjs.com` broker.** Room SDP and ICE
  candidates pass through a third party. There is no signalling server we
  operate, so we cannot offer end-to-end signalling privacy.
- **STUN only, no TURN.** See the
  [connectivity ceiling](../README.md#-connectivity-ceiling-read-this-before-inviting-people-over-the-internet).
  Traffic is direct peer-to-peer and therefore unencrypted at the transport
  layer beyond WebRTC's own DTLS-SRTP, which does protect it in transit.
- **Tokens are stored in plaintext `localStorage`.** Any script that executes in
  the page's origin can read them. This is inherent to a browser game with no
  backend; a token-holding server would be needed to do better.
- **The host is authoritative.** A host is trusted to report game state, and can
  in principle lie about dice outcomes to its own guests. All guests can see
  every roll, so this is visible rather than silent, but it is not prevented.

## Hardening that is in place

- Every inbound packet is schema-validated on **both** sides, including a size
  cap, enum/range checks, and prototype-pollution key rejection.
- Guests may only originate `JOIN_REQUEST`, `RECONNECT_REQUEST`,
  `COLOR_CHANGE_REQUEST`, `ROLL_REQUEST`, `EMOTE`, `PING` and `PONG`. Anything
  else terminates the connection.
- Slot-bound packets are checked against the sender's admitted slot, so one
  guest cannot act as another.
- Reconnect tokens are compared in constant time, and dice are rolled only by
  the host, once per turn, with turn-id and duplicate guards.
- Protocol version is negotiated at admission, so mismatched clients are told to
  refresh rather than silently desyncing.
- `ROLL_REQUEST` is rate limited per peer.
