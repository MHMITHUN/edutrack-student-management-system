"use client";

import { useId, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * Accessible tabs: role=tablist/tab/tabpanel, roving tabindex,
 * arrow-key navigation (Left/Right/Home/End), aria-selected + aria-controls.
 */
export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = useCallback(
    (index: number) => {
      const clamped = (index + items.length) % items.length;
      const tab = tabRefs.current[clamped];
      tab?.focus();
      tab?.scrollIntoView({ block: "nearest" });
    },
    [items.length],
  );

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const key = event.key;
    let next: number | null = null;
    if (key === "ArrowRight") next = index + 1;
    else if (key === "ArrowLeft") next = index - 1;
    else if (key === "Home") next = 0;
    else if (key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    const clamped = (next + items.length) % items.length;
    setActiveId(items[clamped].id);
    focusTab(clamped);
  };

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Tabs"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:border-border hover:text-fg",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
