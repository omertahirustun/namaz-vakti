import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadThemeId, saveThemeId } from './storage';
import { DEFAULT_THEME_ID, THEMES, ThemeDefinition, ThemeId } from './theme';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDefinition;
  /** Depodan kayıtlı tema okunup uygulanana kadar false; App.tsx splash'i bu bitene kadar tutar. */
  ready: boolean;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await loadThemeId();
      setThemeIdState(id);
      setReady(true);
    })();
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    saveThemeId(id).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, theme: THEMES[themeId], ready, setThemeId }),
    [themeId, ready, setThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme, ThemeProvider içinde kullanılmalı');
  return ctx;
}
