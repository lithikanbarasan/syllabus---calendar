// app/api/parse/route.ts
// Parses pasted syllabus text into calendar-friendly events.

import { NextResponse } from "next/server";
import * as chrono from "chrono-node";
import { isValid } from "date-fns";

type ParsedEventOut = {
  title: string;
  start: string;   // ISO string
  end?: string;    // ISO string
  allDay?: boolean;
  sourceLine?: string;
};

// Words that often indicate “this is an event”
const HINTS = [
  "exam", "quiz", "midterm", "final",
  "assignment", "project", "paper", "hw",
  "reading", "presentation", "lab", "report",
];

/** Keep only lines that look like they contain a real date or strong event cue */
function isDatey(line: string) {
  const l = line.toLowerCase();
  const hasSlashDate = /\b\d{1,2}\/\d{1,2}\b/.test(l); // 10/02
  const hasMonthName =
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\s+\d{1,2}/i.test(l); // Oct 6
  const hasDue = /\b(due|deadline)\b/i.test(l);
  const hasExamWord = /\b(exam|quiz|midterm|final)\b/i.test(l);
  const hasOtherHint = HINTS.some((h) => l.includes(h));
  const hasAnyNumber = /\b\d+\b/.test(l);
  return hasSlashDate || hasMonthName || hasDue || hasExamWord || (hasOtherHint && hasAnyNumber);
}

/** Clean, human title that doesn’t eat “10:00” because of the colon */
function extractTitle(line: string) {
  // Prefer text after a spaced dash: "Sep 29 … — Title"
  const dashSplit = line.split(/\s[–—-]\s/); // en dash, em dash, hyphen (with spaces)
  if (dashSplit.length > 1) return dashSplit.slice(1).join(" - ").trim();

  // Otherwise strip leading weekday/date/time tokens and keep the rest
  let s = line;

  // weekday
  s = s.replace(/^\s*\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\.?,?\s+/i, "");

  // month-name day (e.g., "Oct 6" or "September 19")
  s = s.replace(
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\s*/i,
    ""
  );

  // slash date (e.g., "10/02")
  s = s.replace(/^\d{1,2}\/\d{1,2}\s*/, "");

  // time range (e.g., "1:30-3:00 pm", "9:00–10:20am")
  s = s.replace(
    /^\d{1,2}(:\d{2})?\s?(am|pm)?\s*(–|-)\s*\d{1,2}(:\d{2})?\s?(am|pm)?\s*/i,
    ""
  );

  // single time (e.g., "11:59pm")
  s = s.replace(/^\d{1,2}(:\d{2})?\s?(am|pm)\s*/i, "");

  return s.trim() || line.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      text,
      fallbackYear,
      defaultDurationMinutes = 60,
      defaultTime = "23:59", // used only for deadlines that lack an explicit time
    } = body || {};

    if (!text) return NextResponse.json([], { status: 200 });

    const refYear =
      Number.isFinite(Number(fallbackYear)) ? Number(fallbackYear) : new Date().getFullYear();
    // Reference only affects relative parsing; we enforce the year below.
    const referenceDate = new Date(refYear, 7, 1); // Aug 1 as neutral anchor

    const lines = String(text)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter(isDatey);

    const out: ParsedEventOut[] = [];

    for (const line of lines) {
      const isDeadline = /\b(due|deadline)\b/i.test(line);
      const hasTimeToken =
        /(\b\d{1,2}:\d{2}\s?(am|pm)?\b)|(\b\d{1,2}\s?(am|pm)\b)/i.test(line);

      // First parse attempt
      let results = chrono.parse(line, referenceDate, { forwardDate: true });

      // If it's a deadline with no explicit time, append defaultTime for a specific instant
      if (results.length === 0 && isDeadline && !hasTimeToken && defaultTime) {
        results = chrono.parse(`${line} ${defaultTime}`, referenceDate, { forwardDate: true });
      }
      if (results.length === 0) continue;

      const r = results[0];
      const start = r.start?.date();
      if (!start || !isValid(start)) continue;

      // Require month & day certainty (prevents everything collapsing to reference date)
      if (!(r.start.isCertain("month") && r.start.isCertain("day"))) continue;

      // Force fallback year if year wasn’t explicit
      if (!r.start.isCertain("year")) start.setFullYear(refYear);

      // Range?
      let end: Date | undefined;
      const hasRange = !!r.end;
      if (hasRange) {
        end = r.end!.date();
        if (end && !r.end!.isCertain("year")) end.setFullYear(refYear);
        if (end && !isValid(end)) end = undefined;
      }

      // Does the event have a time?
      const hasTime =
        r.start.isCertain("hour") || r.start.isCertain("minute") || hasRange || hasTimeToken;

      // Deadlines: single instant (no end)
      if (!hasRange && hasTime && isDeadline) {
        end = undefined;
      }

      // Timed (not deadline & not already a range): add default duration
      if (!hasRange && hasTime && !isDeadline) {
        const minutes = Number(defaultDurationMinutes) || 60;
        end = new Date(start.getTime() + minutes * 60 * 1000);
      }

      const allDay = !hasTime; // no time tokens → all-day
      const title = extractTitle(line) || "Course Event";

      out.push({
        title,
        start: start.toISOString(),
        end: end ? end.toISOString() : undefined,
        allDay,
        sourceLine: line,
      });
    }

    // De-duplicate by title+start instant
    const unique = Array.from(
      new Map(out.map((e) => [`${e.title}|${e.start}`, e])).values()
    );

    // The page expects a plain array
    return NextResponse.json(unique, { status: 200 });
  } catch (e) {
    console.error("parse route error", e);
    // Return an array even on failure so the client never crashes
    return NextResponse.json([], { status: 200 });
  }
}
