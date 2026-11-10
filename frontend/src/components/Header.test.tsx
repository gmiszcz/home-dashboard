import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Header } from './Header';

function html(props: { viewMode: 'simple' | 'full'; showHidden: boolean }): string {
  return renderToStaticMarkup(
    <Header mode="live" onToggleViewMode={() => undefined} onToggleShowHidden={() => undefined} {...props} />,
  );
}

describe('Header', () => {
  it('names the current view with one word', () => {
    expect(html({ viewMode: 'full', showHidden: false })).toContain('>Pełny<');
    expect(html({ viewMode: 'simple', showHidden: false })).toContain('>Prosty<');
    expect(html({ viewMode: 'full', showHidden: false })).not.toContain('Pełny widok');
    expect(html({ viewMode: 'simple', showHidden: false })).not.toContain('Widok prosty');
  });

  it('uses a crossed eye while hidden tiles are hidden and an open eye when they are shown', () => {
    const hidden = html({ viewMode: 'full', showHidden: false });
    expect(hidden).toContain('pi-eye-slash');
    expect(hidden).toContain('aria-label="Pokaż ukryte kafle"');
    expect(hidden).toContain('aria-pressed="false"');
    expect(hidden).not.toContain('type="checkbox"');

    const shown = html({ viewMode: 'full', showHidden: true });
    expect(shown).toContain('pi-eye');
    expect(shown).not.toContain('pi-eye-slash');
    expect(shown).toContain('aria-label="Ukryj ukryte kafle"');
    expect(shown).toContain('aria-pressed="true"');
  });
});
