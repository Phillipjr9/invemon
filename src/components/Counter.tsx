import { useEffect, useRef, useState } from 'react';

export default function Counter({ value, prefix = '', suffix = '+', label }: { value: number; prefix?: string; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - start) / 1400, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = value * (0.5 + eased * 0.5);
        setDisplay(Number.isInteger(value) ? Math.round(next) : Number(next.toFixed(1)));
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }, { threshold: 0.4 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);

  return <div className="stat" ref={ref}><span className="stat-label">{label}</span><span className="stat-value" aria-label={`${prefix}${value}${suffix}`}><span aria-hidden="true">{prefix}{display}{suffix}</span></span></div>;
}