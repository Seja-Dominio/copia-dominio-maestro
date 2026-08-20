import { useState, useRef, useEffect, useCallback } from "react";
import { TZ } from "@/lib/dateUtils";

const ITEM_H = 32;
const VISIBLE = 3;
const COL_H = ITEM_H * VISIBLE;

function ScrollColumn({ items, value, onChange }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startScroll = useRef(0);

  const idx = items.indexOf(value);

  useEffect(() => {
    if (containerRef.current && !isDragging.current) {
      containerRef.current.scrollTop = idx * ITEM_H;
    }
  }, [idx]);

  const snap = useCallback(() => {
    if (!containerRef.current) return;
    const newIdx = Math.round(containerRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, newIdx));
    containerRef.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
    if (items[clamped] !== value) onChange(items[clamped]);
  }, [items, value, onChange]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const newIdx = Math.max(0, Math.min(items.length - 1, idx + delta));
    containerRef.current?.scrollTo({ top: newIdx * ITEM_H, behavior: "smooth" });
    onChange(items[newIdx]);
  }, [items, idx, onChange]);

  // Touch drag
  const handleTouchStart = (e) => {
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
    startScroll.current = containerRef.current?.scrollTop || 0;
  };
  const handleTouchMove = (e) => {
    if (!isDragging.current || !containerRef.current) return;
    containerRef.current.scrollTop = startScroll.current + (startY.current - e.touches[0].clientY);
  };
  const handleTouchEnd = () => { isDragging.current = false; snap(); };

  // Mouse drag
  const handleMouseDown = (e) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startScroll.current = containerRef.current?.scrollTop || 0;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current || !containerRef.current) return;
    containerRef.current.scrollTop = startScroll.current + (startY.current - e.clientY);
  }, []);
  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    snap();
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [snap, handleMouseMove]);

  return (
    <div className="relative select-none" style={{ height: COL_H, width: 48 }}>
      {/* Highlight band */}
      <div
        className="absolute left-0 right-0 bg-primary/10 rounded-md pointer-events-none z-[1]"
        style={{ top: ITEM_H, height: ITEM_H }}
      />
      {/* Fade top */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-card to-transparent z-[2] pointer-events-none" />
      {/* Fade bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent z-[2] pointer-events-none" />

      <div
        ref={containerRef}
        className="h-full overflow-hidden no-scrollbar cursor-grab active:cursor-grabbing"
        style={{
          paddingTop: ITEM_H,
          paddingBottom: ITEM_H,
        }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {items.map((item) => {
          const isSelected = item === value;
          return (
            <div
              key={item}
              className={`flex items-center justify-center transition-all ${
                isSelected
                  ? "text-foreground font-bold text-lg"
                  : "text-muted-foreground/60 text-sm"
              }`}
              style={{ height: ITEM_H }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export default function TimeScrollPicker({ value, onChange, hideRemove = false }) {
  const [active, setActive] = useState(!!value);

  const getNow = () => {
    const now = new Date();
    const tz = typeof TZ === "function" ? TZ() : "America/Manaus";
    const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    return {
      h: String(local.getHours()).padStart(2, "0"),
      m: String(local.getMinutes()).padStart(2, "0"),
    };
  };

  const parsed = value
    ? { h: value.slice(0, 2), m: value.slice(3, 5) }
    : getNow();

  const [hour, setHour] = useState(parsed.h);
  const [minute, setMinute] = useState(parsed.m);
  const [editingHour, setEditingHour] = useState(false);
  const [editingMinute, setEditingMinute] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (value) {
      setHour(value.slice(0, 2));
      setMinute(value.slice(3, 5));
    }
  }, [value]);

  const handleActivate = () => {
    if (active) return;
    const now = getNow();
    setHour(now.h);
    setMinute(now.m);
    setActive(true);
    onChange(`${now.h}:${now.m}`);
  };

  const handleHourChange = (h) => { setHour(h); onChange(`${h}:${minute}`); };
  const handleMinuteChange = (m) => { setMinute(m); onChange(`${hour}:${m}`); };

  const handleClear = (e) => {
    e.stopPropagation();
    setActive(false);
    onChange(null);
  };

  if (!active) {
    return (
      <button
        onClick={handleActivate}
        className="flex items-center justify-center gap-2 w-full py-2 border-t border-border mt-1 text-muted-foreground hover:text-foreground transition-colors no-touch-min"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span className="text-xs font-medium">Definir horário</span>
      </button>
    );
  }

  const commitHourEdit = (val) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 23) {
      const h = String(n).padStart(2, "0");
      handleHourChange(h);
    }
    setEditingHour(false);
  };

  const commitMinuteEdit = (val) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 59) {
      const m = String(n).padStart(2, "0");
      handleMinuteChange(m);
    }
    setEditingMinute(false);
  };

  return (
    <div className="border-t border-border mt-1 pt-1">
      {/* Editable display */}
      <div className="flex items-center justify-center gap-0.5 mb-1">
        {editingHour ? (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={editValue}
            onChange={e => setEditValue(e.target.value.replace(/\D/g, ""))}
            onBlur={() => commitHourEdit(editValue)}
            onKeyDown={e => { if (e.key === "Enter") commitHourEdit(editValue); if (e.key === "Escape") setEditingHour(false); }}
            className="w-10 h-8 text-center text-lg font-bold rounded-lg border border-primary bg-primary/5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button
            onClick={() => { setEditValue(hour); setEditingHour(true); }}
            className="w-10 h-8 text-center text-lg font-bold rounded-lg hover:bg-muted text-foreground transition-colors no-touch-min"
          >
            {hour}
          </button>
        )}
        <span className="text-lg font-bold text-foreground select-none">:</span>
        {editingMinute ? (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={editValue}
            onChange={e => setEditValue(e.target.value.replace(/\D/g, ""))}
            onBlur={() => commitMinuteEdit(editValue)}
            onKeyDown={e => { if (e.key === "Enter") commitMinuteEdit(editValue); if (e.key === "Escape") setEditingMinute(false); }}
            className="w-10 h-8 text-center text-lg font-bold rounded-lg border border-primary bg-primary/5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button
            onClick={() => { setEditValue(minute); setEditingMinute(true); }}
            className="w-10 h-8 text-center text-lg font-bold rounded-lg hover:bg-muted text-foreground transition-colors no-touch-min"
          >
            {minute}
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-1">
        <ScrollColumn items={HOURS} value={hour} onChange={handleHourChange} />
        <span className="text-xl font-bold text-foreground select-none">:</span>
        <ScrollColumn items={MINUTES} value={minute} onChange={handleMinuteChange} />
      </div>
      {!hideRemove && (
        <button
          onClick={handleClear}
          className="text-[10px] text-destructive w-full text-center py-0.5 no-touch-min"
        >
          Remover horário
        </button>
      )}
    </div>
  );
}