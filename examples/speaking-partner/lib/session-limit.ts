import { useEffect, useState } from "react";

export const SESSION_SECONDS = 180;

export function useCountdown(running: boolean, seconds: number, onZero: () => void): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!running) return;
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        onZero();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seconds]);
  return left;
}
