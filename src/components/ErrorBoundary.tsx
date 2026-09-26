import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * (P3) Top-level error boundary.
 *
 * The app renders a full-screen canvas game loop plus a WebRTC transport. A
 * throw anywhere in that machinery - a malformed checkpoint producing NaN
 * coordinates, an unexpected `colorId`, a browser API that is missing in an
 * embedded webview - used to unmount the whole React tree and leave a blank
 * page. To a player that is indistinguishable from a crashed app, and there
 * was no recovery path short of a manual refresh.
 *
 * This catches it, tells the player what happened in plain language, and
 * offers a one-click retry that remounts the tree. The raw error is logged to
 * the console so it is still diagnosable.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Snake & Ladder] Uncaught render error:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-dvh w-full flex items-center justify-center p-6 bg-emerald-950 text-emerald-100">
        <div className="panel max-w-lg w-full p-6 sm:p-8 text-center border-amber-400/40">
          <div className="text-4xl mb-3" aria-hidden="true">
            🐍
          </div>
          <h1 className="font-display text-2xl text-amber-300">Something went wrong</h1>
          <p className="mt-2 text-sm text-emerald-200/85 font-bold">
            The game hit an unexpected error and stopped. Your room and player
            positions are saved — restarting the app will not lose them.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-black/40 p-3 text-left text-[11px] text-emerald-300/80 whitespace-pre-wrap break-words">
            {error.message || String(error)}
          </pre>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn-theme px-6 py-3 min-h-[48px] cursor-pointer"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-theme-ghost px-6 py-3 min-h-[48px] cursor-pointer"
            >
              Reload the app
            </button>
          </div>
          {import.meta.env.DEV && info ? (
            <details className="mt-4 text-left text-[11px] text-emerald-400/60">
              <summary className="cursor-pointer">Component stack (dev only)</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
                {info}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}
