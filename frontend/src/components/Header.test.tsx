import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Header } from './Header';

function html(props: { viewMode: 'simple' | 'full'; showHidden: boolean }): string {
  return renderToStaticMarkup(
    <Header mode="live" onToggleViewMode={() => undefined} onToggleShowHidden={() => undefined} {...props} />,
  );
}

describe('Header', () => {
  it('shows the Ryuk mark and no Pulpit label', () => {
    const markup = html({ viewMode: 'full', showHidden: false });
    expect(markup).toContain('>Ryuk<');
    expect(markup).toContain('ryuk-logo');
    expect(markup).not.toContain('Pulpit');
  });

  it('labels the view toggle with one word and draws a grid icon', () => {
    const full = html({ viewMode: 'full', showHidden: false });
    const simple = html({ viewMode: 'simple', showHidden: false });
    expect(full).toContain('aria-label="Pełny"');
    expect(simple).toContain('aria-label="Prosty"');
    expect(full).toContain('header-icon');
    expect(full).not.toContain('Pełny widok');
    expect(simple).not.toContain('Widok prosty');
  });

  it('uses a crossed eye while hidden tiles are hidden and an open eye when they are shown', () => {
    const hidden = html({ viewMode: 'full', showHidden: false });
    expect(hidden).toContain('M4 4l16 16');
    expect(hidden).toContain('aria-label="Pokaż ukryte kafle"');
    expect(hidden).toContain('aria-pressed="false"');
    expect(hidden).not.toContain('type="checkbox"');

    const shown = html({ viewMode: 'full', showHidden: true });
    expect(shown).not.toContain('M4 4l16 16');
    expect(shown).toContain('aria-label="Ukryj ukryte kafle"');
    expect(shown).toContain('aria-pressed="true"');
  });
});
