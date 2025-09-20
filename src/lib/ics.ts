import { addDays, addMinutes } from "date-fns";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function fmtDateTime(d: Date) {
  // local time, e.g. 20251016T090000
  return `${fmtDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function esc(s: string) {
  // escape per iCalendar rules
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export type EventLike = {
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  description?: string;
};

export function makeICS(events: EventLike[], calendarName = "Syllabus") {
  const now = new Date();
  const dtstamp = fmtDateTime(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SyllabusToCalendar//EN",
    "CALSCALE:GREGORIAN",
    `NAME:${esc(calendarName)}`,
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];

  events.forEach((e, i) => {
    const uid = `${now.getTime()}-${i}@syllabus.local`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    lines.push(`DTSTAMP:${dtstamp}`);

    if (e.allDay) {
      // All-day events use VALUE=DATE; DTEND is the next day
      const startDate = fmtDate(e.start);
      const endDate = fmtDate(addDays(e.end ?? e.start, 1));
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
    } else {
      const startDT = fmtDateTime(e.start);
      const endDT = fmtDateTime(e.end ?? addMinutes(e.start, 60));
      lines.push(`DTSTART:${startDT}`);
      lines.push(`DTEND:${endDT}`);
    }

    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
