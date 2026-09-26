# Contributing

Thanks for looking at this. It is a small, self-contained project with no
framework beyond React + Vite, so the bar for a change is mostly "does it keep
the build green and the rules correct".

## Getting set up

```bash
npm install
npm run dev -- --host
```

Node `^20.19.0` or `>=22.12.0`.

## Before you open a pull request

All four of these must pass. CI runs exactly these, so running them locally
saves a round trip:

```bash
npm run typecheck   # tsc --noEmit, strict
npm run lint        # eslint
npm test            # vitest
npm run build       # vite build
```

## Ground rules for the code

**The reducer is pure and transactional.** `src/game/gameReducer.ts` never
touches the DOM, timers, `Math.random`, or the network. Every mutation carries a
`txId` and is rejected if it does not match, which is what makes the animation
timers safe to cancel. If you add an action, keep it pure.

**`useGame` owns the clock; `useMultiplayer` owns the wire.** Do not read or
write transport state from the game engine, and do not put game rules in the
network layer. `ROLL_REQUEST` is answered by the host; the guest never rolls for
itself in an online match.

**Do not mutate a `gs.current` snapshot you captured earlier in a frame.**
`dispatch()` replaces `gs.current` with a *new* object, so a reference taken
before a dispatch is orphaned. Route state changes through `dispatch` or re-read
`gs.current` afterwards. There is a real bug that this caused; the comment on
`SET_IMPACT` explains it.

**The rAF loop is the hot path.** It runs 60x/second. Prefer reusing a buffer
over allocating one, and never allocate inside it unnecessarily. Several
`P2` comments mark places this was already tightened up.

**Every timer needs a home.** Game timers go in `activeTimers`, one-shot UI
timers in `uiTimers`; both are cleared on unmount. A timer with no owner is how
a turn gets stuck forever.

## Rules changes

The board itself (ladder/snake positions, win rules, the lucky-six rule) is the
part players notice most and regress most easily. If you touch any of it:

- Update or add a case in `tests/rulesAndCoordinates.test.ts` or
  `tests/stateMachine.test.ts`.
- A rolled 6 grants exactly one extra turn, on **every** path — including a
  blocked roll that cannot move, and including a roll that ends on a snake.
  There are six such paths; if you add one, it needs the same treatment.
- The exact-100 and bounce-back rules must both be checked. Half the roll
  outcomes behave differently between them.

## Tests

`tests/productionReadiness.test.tsx` holds regressions for defects that produced
unrecoverable failures for a real player (a permanently dead roll button, a
frozen match, a wiped roster). If you fix something in that class, add a case
there — the value is entirely in preventing the same bug from coming back.

Note that `moving` and `sliding` are driven by `requestAnimationFrame`, not by
`setTimeout`, so fake timers will not move a token across the board on their
own. See the rAF shim at the top of that file.

## Pull requests

Keep them focused — one concern per PR. Describe what was wrong, not just what
you changed. If you fixed a bug, say how it reproduced.
