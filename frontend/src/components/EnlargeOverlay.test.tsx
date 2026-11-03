import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnlargePanel, nextTrapIndex, overlayKeyAction } from './EnlargeOverlay';

describe('nextTrapIndex', () => {
  it('moves forward and wraps to the first element', () => {
    expect(nextTrapIndex(0, 3, false)).toBe(1);
    expect(nextTrapIndex(2, 3, false)).toBe(0);
  });

  it('moves backward and wraps to the last element', () => {
    expect(nextTrapIndex(1, 3, true)).toBe(0);
    expect(nextTrapIndex(0, 3, true)).toBe(2);
  });

  it('enters the list from outside', () => {
    expect(nextTrapIndex(-1, 3, false)).toBe(0);
    expect(nextTrapIndex(-1, 3, true)).toBe(2);
  });

  it('returns -1 without focusable elements', () => {
    expect(nextTrapIndex(0, 0, false)).toBe(-1);
    expect(nextTrapIndex(-1, 0, true)).toBe(-1);
  });
});

describe('overlayKeyAction', () => {
  it('closes on Escape', () => {
    expect(overlayKeyAction('Escape', false, 1, 3)).toEqual({ kind: 'close' });
  });

  it('keeps Tab and Shift+Tab inside the overlay', () => {
    expect(overlayKeyAction('Tab', false, 2, 3)).toEqual({ kind: 'focus', index: 0 });
    expect(overlayKeyAction('Tab', true, 0, 3)).toEqual({ kind: 'focus', index: 2 });
  });

  it('ignores other keys', () => {
    expect(overlayKeyAction('a', false, 0, 3)).toBeNull();
    expect(overlayKeyAction('Enter', false, 0, 3)).toBeNull();
  });
});

describe('EnlargePanel', () => {
  const html = renderToStaticMarkup(
    <EnlargePanel title="Wydatki tygodnia" titleId="enlarge-title" onClose={() => undefined}>
      <p>treść</p>
    </EnlargePanel>,
  );

  it('is a modal dialog labelled by its title', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="enlarge-title"');
    expect(html).toContain('id="enlarge-title"');
    expect(html).toContain('Wydatki tygodnia');
  });

  it('has a visible close button', () => {
    expect(html).toContain('aria-label="Zamknij widok pełnoekranowy"');
    expect(html).toContain('<span>Zamknij</span>');
  });

  it('renders its children and the summary slot', () => {
    expect(html).toContain('<p>treść</p>');
    expect(html).toContain('summary-slot');
  });
});
