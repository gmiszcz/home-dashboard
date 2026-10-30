import { createContext } from 'react';

/** DOM node inside the tile header. Renderers portal compact controls into it. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);
