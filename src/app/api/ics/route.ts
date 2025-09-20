// app/api/ics/route.ts
import { NextResponse } from "next/server";
import { makeICS, type EventLike } from "@/lib/ics";

type IncomingEvent = {
  title: string;
  start: string | Date;
  end?: string | Date;
  allDay?: boolean;
  sourceLine?: string;
};

export async function POST(req: Request) {
  try {
    // calendar can come from query (?calendar=...) or body.calendarName
    const url = new URL(req.url);
    const calendarFromQuery = url.searchParams.get("calendar") || undefined;

    const raw = await req.json().catch(() => null);

    // Accept both:
    // 1) body = [ ...events ]
    // 2) body = { events: [ ... ], calendarName?: string }
    const bodyArray = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
    const calendarName = calendarFromQuery ?? (raw?.calendarName || "Syllabus");

    if (!Array.isArray(bodyArray) || bodyArray.length === 0) {
      return NextResponse.json({ error: "No events provided" }, { status: 400 });
    }

    const normalized: EventLike[] = bodyArray.map((e: IncomingEvent) => ({
      title: e.title ?? "Untitled",
      start: new Date(e.start),
      end: e.end ? new Date(e.end) : undefined,
      allDay: !!e.allDay,
      description: e.sourceLine ? `From syllabus: ${e.sourceLine}` : undefined,
    }));

    const ics = makeICS(normalized, calendarName);

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitize(calendarName)}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("ICS route error", err);
    return NextResponse.json({ error: "Failed to build ICS" }, { status: 500 });
  }
}

function sanitize(name: string) {
  return String(name).replace(/[\\/:*?"<>|]+/g, "_").trim() || "calendar";
}
