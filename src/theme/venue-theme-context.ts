import { createContext, useContext } from 'react';
import type { Theme } from '@/data/types';

export const ThemeContext = createContext<Theme | null>(null);
export const useVenueTheme = () => useContext(ThemeContext);
