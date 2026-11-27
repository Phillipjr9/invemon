import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  close: 'm6 6 12 12M6 18 18 6',
  menu: 'm4 15 11-11M4 20 16 8m-7 12L20 9',
  money: 'm8 3 2 4h4l2-4H8Zm2 4C8 10 5 13 5 17c0 5 14 5 14 0 0-4-3-7-5-10M14 12h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-9v10',
  coins: 'M3 5c0-3 12-3 12 0S3 8 3 5Zm0 0v4c0 2 7 3 11 1M3 9v4c0 2 4 3 7 3M3 13v4c0 2 4 3 7 3M15 7v2m6 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-6-4v8m2-7h-3v3h3v3h-3',
  target: 'M20 11a9 9 0 1 1-7-8m3 9a4 4 0 1 1-4-4m0 4L22 2m-1 0h-4v4h4V2Z',
  gem: 'm3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18M8 8l4-5 4 5M3 2 2 1m19 1 1-1M12 0v1',
  chart: 'm3 17 5-6 5 3 7-8M6 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm4-8a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm5 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm7-10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-12-3 14',
  clock: 'M12 5v7l-4 2m13-2a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z',
  wallet: 'M3 5h18v15H3V5Zm0 3h18M3 11h18M3 3h18v2',
  folders: 'M3 3h5v18H3V3Zm7 0h5v18h-5V3Zm7 0h5v18h-5V3ZM5 6h1v5H5Zm7 0h1v5h-1Zm7 0h1v5h-1ZM5 17h1m6 0h1m6 0h1',
  phone: 'M6 2h12v20H6V2Zm0 3h12M6 18h12m-7 2h2m-4-7 3-4 3 2-2 3m0-7h3v3',
  sprout: 'M3 16h4l4 2h6l3-3c3-1 3 1 1 3l-4 3h-7l-3-2H3v-3Zm9-2V7m0 2C5 11 5 4 5 4s7-1 7 5Zm0-3c1-5 8-4 8-4s0 7-8 7m-5-3 5 3 5-4',
  coffee: 'M4 10h13v5a6 6 0 0 1-12 0l-1-5Zm13 1h3c3 4-1 6-4 5M2 21h19M7 2c-4 4 4 3 0 6m5-6c-4 4 4 3 0 6m5-6c-4 4 4 3 0 6',
  home: 'm2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9',
  buildings: 'M3 21V9h5v12m0 0V3h5v18m0 0V7h5v14m0 0V2h3v19M1 21h22M5 12v5m6-10v3m0 3v3m5-6v7',
  tower: 'M9 2h7v20H9V2Zm-5 7h5m7 2h5M3 6l6 5-6 5V6Zm13 6 5 5-5 5m-4-16v2m0 3v2m0 3v2',
  check: 'm5 12 4 4L19 6',
  mail: 'M3 5h18v14H3V5Zm0 0 9 8 9-8',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3',
  call: 'm5 3 4 4-3 3c2 4 4 6 8 8l3-3 4 4c-2 5-6 3-11-1S0 7 5 3Zm9 0c4 1 6 3 7 7m-7-3 3 3',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  chevron: 'm7 10 5 5 5-5',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17l10 5 10-5',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeoff: 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 4.1M6.2 6.2C3.4 8 2 12 2 12s3.5 7 10 7a11 11 0 0 0 3.8-.7',
  percent: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  bolt: 'M13 2 3 14h8l-1 8 10-12h-8l1-8Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3.8 0L7 22l5-3 5 3-1.2-7',
  arrowLeft: 'M20 12H4m6-6-6 6 6 6',
  key: 'M15 7a4 4 0 1 1-7.5 2H2v3h2v2h3v-2h.5A4 4 0 0 1 15 7Zm-1 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z',
  fingerprint: 'M12 11v4m-4-2a4 4 0 0 1 8 0c0 2.5-.5 4.5-1.5 6.5M6 12a6 6 0 0 1 12 0c0 3-.6 5.4-2 8M4.5 9.5a8.5 8.5 0 0 1 15 0c.6 1.8.6 4.5 0 7.5M8.5 16.5c-.4 1.3-.9 2.4-1.5 3.5',
  alert: 'M12 9v4m0 4h.01M10.3 3.8 1.8 18.4A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.6L13.7 3.8a2 2 0 0 0-3.4 0Z',
  sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Zm6.5 11.5.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z',
  flower: 'M12 2c7 0 7 20 0 20S5 2 12 2ZM3 7c3-6 21 4 18 10S0 13 3 7Zm0 10C0 11 18 1 21 7S6 23 3 17Z',
};

export default function Icon({ name, size = 24, className = '', style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  if (name === 'play') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" style={style}><path d="M6 3.8c0-1 1-1.4 1.8-.9l13 8.1c.8.5.8 1.5 0 2l-13 8.1c-.8.5-1.8.1-1.8-.9V3.8Z" /></svg>;
  }
  if (name === 'star') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="m12 2 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-.9L12 2Z" /></svg>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" style={style}><path d={paths[name] || paths.chart} /></svg>;
}