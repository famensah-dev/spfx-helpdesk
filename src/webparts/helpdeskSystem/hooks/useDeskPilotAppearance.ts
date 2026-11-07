import * as React from 'react';
import { Chart } from 'chart.js';
import { darkColor } from '../utils/themeColors';
import { themeColorTokens } from '../utils/themeColorTokens';
export const appearanceStorageKey = 'deskpilot:appearance';
export const DeskPilotAppearanceContext = React.createContext(false);
const appearanceEvent = 'deskpilot-appearance-change';
export function readAppearance(): boolean {
  try { return window.localStorage.getItem(appearanceStorageKey) === 'dark'; } catch { return false; }
}
export function useDeskPilotAppearance(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = React.useState(readAppearance);
  React.useLayoutEffect(() => {
    // Namespaced variables also reach our portaled dialogs without styling the SharePoint host.
    for (const token of themeColorTokens) {
      if (dark) document.documentElement.style.setProperty(token.name, darkColor(token.color, token.role));
      else document.documentElement.style.removeProperty(token.name);
    }
    if (dark) {
      document.documentElement.style.setProperty('--dp-active-subtab', '#344860');
      document.documentElement.style.setProperty('--dp-active-subtab-text', '#a8ceff');
    } else {
      document.documentElement.style.removeProperty('--dp-active-subtab');
      document.documentElement.style.removeProperty('--dp-active-subtab-text');
    }
    Chart.defaults.color = dark ? '#c3c9d1' : '#666666';
    Chart.defaults.borderColor = dark ? '#2a3d55' : 'rgba(0,0,0,0.1)';
  }, [dark]);
  React.useEffect(() => {
    const sync = (): void => setDark(readAppearance());
    const local = (event: Event): void => setDark((event as CustomEvent<boolean>).detail);
    window.addEventListener('storage', sync);
    window.addEventListener(appearanceEvent, local);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(appearanceEvent, local); };
  }, []);
  const toggle = (): void => {
    const next = !dark;
    try { window.localStorage.setItem(appearanceStorageKey, next ? 'dark' : 'light'); } catch { /* The toggle still works when browser storage is blocked. */ }
    setDark(next);
    window.dispatchEvent(new CustomEvent<boolean>(appearanceEvent, { detail: next }));
  };
  return { dark, toggle };
}
