import { useEffect, useState } from 'react';
import '../theme.css';

type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
export const getThemePreference = (): ThemePreference => {
  try { const value=localStorage.getItem('invemon-theme');return value==='light'||value==='dark'?value:'system'; } catch { return 'system'; }
};
export function setThemePreference(value:ThemePreference) {
  try { if(value==='system')localStorage.removeItem('invemon-theme');else localStorage.setItem('invemon-theme',value); } catch { /* Apply for this session even without storage. */ }
  window.dispatchEvent(new CustomEvent<ThemePreference>('invemon-theme-preference',{detail:value}));
}
const systemTheme = (): Theme => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const savedTheme = (): Theme | null => {
  try { const value = localStorage.getItem('invemon-theme'); return value === 'dark' || value === 'light' ? value : null; } catch { return null; }
};
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() || systemTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141f1a' : '#194637');
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemChanged = () => { if (!savedTheme()) setTheme(systemTheme()); };
    const storageChanged = (event: StorageEvent) => { if (event.key === 'invemon-theme' || event.key === null) setTheme(savedTheme() || systemTheme()); };
    const preferenceChanged=(event:Event)=>{const choice=(event as CustomEvent<ThemePreference>).detail;setTheme(choice==='system'?systemTheme():choice);};
    window.addEventListener('invemon-theme-preference',preferenceChanged);
    media.addEventListener('change', systemChanged);
    window.addEventListener('storage', storageChanged);
    return () => { media.removeEventListener('change', systemChanged); window.removeEventListener('storage', storageChanged); window.removeEventListener('invemon-theme-preference',preferenceChanged); };
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
    setTheme(next);
  };
  return <button type="button" className="theme-toggle" aria-label="Dark mode" aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggle}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z" />}</svg>
    <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
  </button>;
}
