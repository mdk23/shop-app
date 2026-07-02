"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

export function Clock() {
  const [time, setTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex flex-col items-end opacity-0">
        <span className="text-lg font-bold text-on-surface tabular-nums">00:00:00</span>
        <span className="text-xs text-on-surface-variant font-medium">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <span className="text-lg font-bold text-on-surface tabular-nums">
        {format(time, "HH:mm:ss")}
      </span>
      <span className="text-xs text-on-surface-variant font-medium">
        {format(time, "EEEE, MMMM do")}
      </span>
    </div>
  );
}
