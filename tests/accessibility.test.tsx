/**
 * @vitest-environment jsdom
 */
import React, { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dialog from '../src/components/Dialog';
import AriaLiveAnnouncer from '../src/components/AriaLiveAnnouncer';
import AccessibleBoardTable from '../src/components/AccessibleBoardTable';
import type { PlayerConfig } from '../src/game/useGame';

describe('Accessibility & Dialog Suite', () => {
  beforeEach(() => {
    let root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
    root.removeAttribute('inert');
    root.removeAttribute('aria-hidden');
    root.innerHTML = '<button id="bg-button">Background Action</button>';
  });

  describe('1. Dialog Component (Modal, Focus Trap, Inert, Restoration)', () => {
    it('does not render content into DOM when isOpen is false', () => {
      render(
        <Dialog isOpen={false} onClose={() => {}} titleId="test-title">
          <p>Dialog Body</p>
        </Dialog>,
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('Dialog Body')).toBeNull();
    });

    it('renders with role="dialog", aria-modal="true", and aria-labelledby', () => {
      render(
        <Dialog isOpen={true} onClose={() => {}} titleId="my-dialog-title">
          <h2 id="my-dialog-title">Settings Modal</h2>
          <button>Close</button>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('my-dialog-title');
    });

    it('sets inert and aria-hidden on #root when open, and restores them when closed', () => {
      const rootElement = document.getElementById('root')!;
      expect(rootElement.hasAttribute('inert')).toBe(false);
      expect(rootElement.getAttribute('aria-hidden')).toBeNull();

      const { rerender } = render(
        <Dialog isOpen={true} onClose={() => {}}>
          <button id="modal-btn">Inside Modal</button>
        </Dialog>,
      );

      expect(rootElement.hasAttribute('inert')).toBe(true);
      expect(rootElement.getAttribute('aria-hidden')).toBe('true');

      // Close dialog
      rerender(
        <Dialog isOpen={false} onClose={() => {}}>
          <button id="modal-btn">Inside Modal</button>
        </Dialog>,
      );

      expect(rootElement.hasAttribute('inert')).toBe(false);
      expect(rootElement.getAttribute('aria-hidden')).toBeNull();
    });

    it('restores focus to previous active element on unmount', async () => {
      const bgBtn = document.getElementById('bg-button') as HTMLButtonElement;
      bgBtn.focus();
      expect(document.activeElement).toBe(bgBtn);

      function TestHarness() {
        const [open, setOpen] = useState(true);
        return (
          <>
            <button id="close-trigger" onClick={() => setOpen(false)}>
              Close Dialog
            </button>
            <Dialog isOpen={open} onClose={() => setOpen(false)}>
              <button id="inside-btn">Inside</button>
            </Dialog>
          </>
        );
      }

      const { unmount } = render(<TestHarness />);

      // Wait a frame for initial focus
      await new Promise((res) => requestAnimationFrame(res));
      expect(document.activeElement?.id).toBe('inside-btn');

      // Unmount dialog
      unmount();
      expect(document.activeElement).toBe(bgBtn);
    });

    it('supports initialFocusRef to prioritize specific element', async () => {
      function HarnessWithInitialFocus() {
        const primaryRef = useRef<HTMLButtonElement>(null);
        return (
          <Dialog isOpen={true} onClose={() => {}} initialFocusRef={primaryRef}>
            <button id="secondary-btn">Cancel</button>
            <button id="primary-btn" ref={primaryRef}>
              Confirm Action
            </button>
          </Dialog>
        );
      }

      render(<HarnessWithInitialFocus />);
      await new Promise((res) => requestAnimationFrame(res));
      expect(document.activeElement?.id).toBe('primary-btn');
    });

    it('invokes onClose when Escape key is pressed', () => {
      const onCloseSpy = vi.fn();
      render(
        <Dialog isOpen={true} onClose={onCloseSpy} closeOnEscape={true}>
          <button>OK</button>
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('traps Tab key navigation inside modal boundaries', () => {
      render(
        <Dialog isOpen={true} onClose={() => {}}>
          <button id="btn-1">First</button>
          <input id="input-2" type="text" />
          <button id="btn-3">Last</button>
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      const btn1 = document.getElementById('btn-1') as HTMLButtonElement;
      const btn3 = document.getElementById('btn-3') as HTMLButtonElement;

      // Mock non-zero dimensions in JSDOM so focusable filter recognises elements
      Object.defineProperty(btn1, 'offsetWidth', { configurable: true, value: 50 });
      Object.defineProperty(btn3, 'offsetWidth', { configurable: true, value: 50 });

      // Focus last element and press Tab -> should cycle to first
      btn3.focus();
      expect(document.activeElement).toBe(btn3);
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(btn1);

      // Focus first element and press Shift+Tab -> should cycle to last
      btn1.focus();
      expect(document.activeElement).toBe(btn1);
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(btn3);
    });
  });

  describe('2. AriaLiveAnnouncer Component', () => {
    it('renders with role="status" and aria-live="polite" by default', () => {
      render(<AriaLiveAnnouncer message="Player 1 rolled a 6" />);
      const announcer = screen.getByRole('status');
      expect(announcer).not.toBeNull();
      expect(announcer.getAttribute('aria-live')).toBe('polite');
      expect(announcer.getAttribute('aria-atomic')).toBe('true');
      expect(announcer.classList.contains('sr-only')).toBe(true);
      expect(announcer.textContent).toBe('Player 1 rolled a 6');
    });

    it('sets aria-live="assertive" when assertive prop is true', () => {
      render(<AriaLiveAnnouncer message="Player 2 won the game!" assertive={true} />);
      const announcer = screen.getByRole('status');
      expect(announcer.getAttribute('aria-live')).toBe('assertive');
      expect(announcer.textContent).toBe('Player 2 won the game!');
    });
  });

  describe('3. AccessibleBoardTable Component', () => {
    const players: PlayerConfig[] = [
      { id: 'p1', slotIndex: 0, name: 'Alice', colorId: 0, isCpu: false },
      { id: 'p2', slotIndex: 1, name: 'Bob', colorId: 1, isCpu: true },
    ];

    it('renders accessible overview with turn and player coordinates', () => {
      // Alice on square 15, Bob in start dock (0)
      render(<AccessibleBoardTable players={players} positions={[15, 0]} currentTurn={0} />);

      const section = screen.getByRole('region', { name: /Accessible Game Board Overview/i });
      expect(section).not.toBeNull();
      expect(section.classList.contains('sr-only')).toBe(true);

      // Current turn announcement
      expect(screen.getByText(/Current Turn: Alice/i)).not.toBeNull();

      // Start bay and active square descriptions
      expect(screen.getByText(/Alice: Square 15/i)).not.toBeNull();
      expect(screen.getByText(/Bob: Start Bay/i)).not.toBeNull();
    });

    it('renders all 100 tiles and correctly identifies portals and player occupants', () => {
      render(<AccessibleBoardTable players={players} positions={[15, 4]} currentTurn={1} />);

      // Square 4 has ladder to 14
      expect(screen.getByText(/Ladder climbs up to 14/i)).not.toBeNull();
      // Square 16 has snake to 6
      expect(screen.getByText(/Snake drops down to 6\b/i)).not.toBeNull();
      // Square 100 finish podium
      expect(screen.getByText(/Finish podium/i)).not.toBeNull();

      // Occupants on square 4
      const row4 = screen.getByRole('row', { name: /4 Ladder climbs up to 14 Bob/i });
      expect(row4).not.toBeNull();

      // Occupants on square 15
      const row15 = screen.getByRole('row', { name: /15 Regular square Alice/i });
      expect(row15).not.toBeNull();
    });
  });

  describe('4. Shortcut Filter & Input Suppression Logic', () => {
    it('ignores shortcuts when active element is an input, textarea, or select', () => {
      const shortcutSpy = vi.fn();

      const listener = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.getAttribute?.('contenteditable') === 'true' ||
            target.closest?.('[contenteditable="true"]') ||
            target.closest?.('[role="dialog"]') ||
            target.closest?.('dialog'))
        ) {
          return;
        }
        if (document.querySelector('[role="dialog"], dialog')) {
          return;
        }
        shortcutSpy(e.code);
      };

      window.addEventListener('keydown', listener);

      // 1. Text input test
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));

      expect(shortcutSpy).not.toHaveBeenCalled();

      // 2. Textarea test
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      expect(shortcutSpy).not.toHaveBeenCalled();

      // 3. Select test
      const select = document.createElement('select');
      document.body.appendChild(select);
      select.focus();
      select.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
      expect(shortcutSpy).not.toHaveBeenCalled();

      // 4. Contenteditable test
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      document.body.appendChild(editable);
      editable.focus();
      editable.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      expect(shortcutSpy).not.toHaveBeenCalled();

      // 5. Open dialog in DOM suppresses background body events
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
      document.body.focus();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      expect(shortcutSpy).not.toHaveBeenCalled();

      // 6. Clean state allows shortcuts
      document.body.removeChild(dialog);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      expect(shortcutSpy).toHaveBeenCalledWith('KeyF');

      window.removeEventListener('keydown', listener);

      // Cleanup elements
      input.remove();
      textarea.remove();
      select.remove();
      editable.remove();
    });
  });
});
