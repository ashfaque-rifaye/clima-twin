import { useEffect, useState } from "react";

/**
 * Cycles through progressive loading messages while `active` — the user must
 * always see that processing is happening, never a frozen panel.
 */
export function useLoadingSteps(active: boolean, steps: string[], intervalMs = 1300): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    const t = window.setInterval(() => setI((v) => (v + 1) % steps.length), intervalMs);
    return () => window.clearInterval(t);
  }, [active, steps.length, intervalMs]);
  return steps[Math.min(i, steps.length - 1)];
}
