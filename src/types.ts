export type ParsedEvent = { // export makes this type parsedEvent object with the following properties available to other files in the project 
    title: string; // event name is required 
    start: Date; // start date is required 
    end?: Date; // end date is optional
    allDay?: boolean; // all day event is optional 
    sourceLine: string; // original line from syllabus is required to preview 
  };