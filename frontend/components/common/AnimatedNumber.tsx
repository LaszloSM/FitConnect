"use client";
import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value = 0,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1000,
}: {
  value?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const startValRef = useRef(0);
  const displayedRef = useRef(0);

  const safeValue = isNaN(value) ? 0 : Math.max(0, value);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    startRef.current = null;
    startValRef.current = displayedRef.current;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValRef.current + (safeValue - startValRef.current) * eased;
      setDisplayed(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayed(safeValue);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [safeValue, duration]);

  const formatted = displayed.toFixed(decimals);

  return (
    <span className="font-display font-bold tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
