import { createContext } from 'react';

/** DOM node inside the tile header. Renderers portal compact controls into it. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/** DOM node at the right end of the grey summary line. Renderers portal one small control into it. */
export const SummarySlotContext = createContext<HTMLElement | null>(null);

/** Lets a renderer tell the tile whether its "show more" button does anything in the current view. */
export const ExpandControlContext = createContext<(canExpand: boolean) => void>(() => undefined);
