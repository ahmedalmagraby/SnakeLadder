import { useEffect, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
  descriptionId?: string;
  ariaLabel?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

export default function Dialog({
  isOpen,
  onClose,
  titleId,
  descriptionId,
  ariaLabel,
  initialFocusRef,
  closeOnEscape = true,
  closeOnBackdropClick = true,
  children,
  className = '',
  backdropClassName = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Focus restoration & inert background handling
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

    // Apply inert and aria-hidden to #root while dialog is open
    const rootEl = document.getElementById('root');
    const wasInert = rootEl?.hasAttribute('inert') ?? false;
    const wasAriaHidden = rootEl?.getAttribute('aria-hidden');

    if (rootEl) {
      rootEl.setAttribute('inert', '');
      rootEl.setAttribute('aria-hidden', 'true');
    }

    // Set initial focus
    const focusTimer = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    });

    return () => {
      cancelAnimationFrame(focusTimer);

      if (rootEl) {
        if (!wasInert) rootEl.removeAttribute('inert');
        if (wasAriaHidden !== null && wasAriaHidden !== undefined) {
          rootEl.setAttribute('aria-hidden', wasAriaHidden);
        } else {
          rootEl.removeAttribute('aria-hidden');
        }
      }

      // Restore previous focus
      if (
        previouslyFocusedElementRef.current &&
        typeof previouslyFocusedElementRef.current.focus === 'function' &&
        document.contains(previouslyFocusedElementRef.current)
      ) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen, initialFocusRef]);

  // Global key listener for Escape and Tab trapping
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && closeOnEscape) {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-label={titleId ? undefined : ariaLabel}
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm fade-in outline-none ${backdropClassName}`}
    >
      <div className={`panel pop-in max-h-[92vh] overflow-y-auto ${className}`}>
        {children}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
