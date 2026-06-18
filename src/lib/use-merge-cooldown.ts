"use client";

import { useEffect, useState } from "react";
import { getMergeCooldownRemainingMs } from "@/lib/merge-cooldown";

export function useMergeCooldown(): { active: boolean; remainingMs: number } {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const tick = () => {
      setRemainingMs(getMergeCooldownRemainingMs());
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  return { active: remainingMs > 0, remainingMs };
}
