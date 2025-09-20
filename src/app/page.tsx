// src/app/page.tsx
"use client";

import { useState } from "react";
import type { ParsedEvent } from "@/types";

type Incoming = Omit<ParsedEvent, "start" | "end"> & {
  start: string | Date;
  end?: string | Date;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [calName, setCalName] = useState("Course Syllabus");
  const [loading, setLoading] = useState<"parse" | "ics" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasEvents = events.length > 0;

  async function handleParse() {
    setError(null);
    setLoading("parse");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          fallbackYear: year,
          defaultDurationMinutes: 60,
        }),
      });
      if (!res.ok) throw new Error(`Parse failed (${res.status})`);
      const data: Incoming[] = await res.json();
      setEvents(
        data.map((e) => ({
          ...e,
          start: new Date(e.start),
          end: e.end ? new Date(e.end) : undefined,
        }))
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong while parsing.";
      setError(msg);
    } finally {
      setLoading(null);
    }
  }

  async function handleDownloadICS() {
    setError(null);
    setLoading("ics");
    try {
      const res = await fetch(
        `/api/ics?calendar=${encodeURIComponent(calName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            events.map((e) => ({
              ...e,
              start: e.start.toISOString(),
              end: e.end ? e.end.toISOString() : undefined,
            }))
          ),
        }
      );
      if (!res.ok) throw new Error(`ICS generation failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilename(calName || "syllabus")}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not create .ics file.";
      setError(msg);
    } finally {
      setLoading(null);
    }
  }

  function updateEvent(i: number, patch: Partial<ParsedEvent>) {
    setEvents((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e))
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Syllabus → Calendar</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Calendar name</label>
        <input
          className="w-full border rounded px-3 py-2 bg-transparent"
          value={calName}
          onChange={(e) => setCalName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Paste syllabus text</label>
          <textarea
            className="w-full h-48 border rounded px-3 py-2 bg-transparent"
            placeholder={`e.g.\nSep 19 3–4pm — Quiz 1\n10/02 11:59pm — HW 1 due\nMon Oct 6 1:30-3:00 pm Midterm`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="space-y-2 w-28">
          <label className="block text-sm font-medium">Year</label>
          <input
            type="number"
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={year}
            onChange={(e) => {
              const v = Number(e.target.value);
              const clamped = Number.isFinite(v)
                ? Math.min(2100, Math.max(1900, v))
                : new Date().getFullYear();
              setYear(clamped);
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
          />
          <button
            className="w-full border rounded px-3 py-2 disabled:opacity-50"
            onClick={handleParse}
            disabled={loading === "parse"}
          >
            {loading === "parse" ? "Parsing..." : "Parse"}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      {hasEvents && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Preview &amp; edit</h2>
          <div className="text-xs opacity-70">Tip: click fields to edit; times are local.</div>

          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <colgroup>
                {[
                  <col key="title" className="w-[28rem]" />,
                  <col key="start" className="w-[14rem]" />,
                  <col key="end" className="w-[14rem]" />,
                  <col key="all" className="w-[6rem]" />,
                  <col key="src" className="w-[36rem]" />,
                ]}
              </colgroup>
              <thead className="bg-black/5">
                <tr>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Start</th>
                  <th className="text-left p-2">End</th>
                  <th className="text-left p-2">All-day</th>
                  <th className="text-left p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-2">
                      <input
                        className="w-full bg-transparent border rounded px-2 py-1"
                        value={e.title}
                        onChange={(ev) => updateEvent(i, { title: ev.target.value })}
                      />
                    </td>

                    {/* Start */}
                    <td className="p-2">
                      {e.allDay ? (
                        <input
                          type="date"
                          className="bg-transparent border rounded px-2 py-1"
                          value={toLocalDateInput(e.start)}
                          onChange={(ev) =>
                            updateEvent(i, {
                              start: atLocalMidnight(ev.target.value, e.start),
                              end: undefined,
                            })
                          }
                        />
                      ) : (
                        <input
                          type="datetime-local"
                          className="bg-transparent border rounded px-2 py-1"
                          value={toLocalInput(e.start)}
                          onChange={(ev) =>
                            updateEvent(i, {
                              start: fromLocalInput(ev.target.value, e.start),
                            })
                          }
                        />
                      )}
                    </td>

                    {/* End */}
                    <td className="p-2">
                      {e.allDay ? (
                        <input
                          type="date"
                          className="bg-transparent border rounded px-2 py-1"
                          value={toLocalDateInput(e.end ?? e.start)}
                          onChange={() => updateEvent(i, { end: undefined })}
                        />
                      ) : (
                        <input
                          type="datetime-local"
                          className="bg-transparent border rounded px-2 py-1"
                          value={e.end ? toLocalInput(e.end) : ""}
                          onChange={(ev) =>
                            updateEvent(i, {
                              end: ev.target.value
                                ? fromLocalInput(ev.target.value, e.end)
                                : undefined,
                            })
                          }
                        />
                      )}
                    </td>

                    {/* All-day */}
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!e.allDay}
                        onChange={(ev) => {
                          const checked = ev.target.checked;
                          updateEvent(i, {
                            allDay: checked,
                            end: checked ? undefined : e.end,
                            start: checked
                              ? atLocalMidnight(toLocalDateInput(e.start), e.start)
                              : e.start,
                          });
                        }}
                      />
                    </td>

                    {/* Source */}
                    <td className="p-2 text-xs opacity-70 align-top">
                      <div className="break-words whitespace-normal">{e.sourceLine}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              className="border rounded px-4 py-2 disabled:opacity-50"
              onClick={handleDownloadICS}
              disabled={!hasEvents || loading === "ics"}
            >
              {loading === "ics" ? "Building..." : "Download .ics"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function toLocalDateInput(d: Date) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function fromLocalInput(value: string, fallback?: Date) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
}

function atLocalMidnight(dateStr: string, fallback?: Date) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return Number.isNaN(local.getTime()) ? (fallback ?? new Date()) : local;
}

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim();
}
