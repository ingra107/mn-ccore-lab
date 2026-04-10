const fs = require('fs');
let c = fs.readFileSync('src/pages/MeetingDetail.tsx', 'utf8');
const orig = c;

// Status badge fontSize 11px
c = c.replace(
  "style={{ fontSize: '11px', background: statusStyle.bg, color: statusStyle.text }}",
  "style={{ fontSize: 'var(--label-size)', background: statusStyle.bg, color: statusStyle.text }}"
);

// Prep View link fontSize 11px
c = c.replace(
  "fontSize: '11px',\n                color: 'var(--teal)', textDecoration: 'none',\n                border: '1px solid rgba(45,138,138,0.2)',",
  "fontSize: 'var(--label-size)',\n                color: 'var(--teal)', textDecoration: 'none',\n                border: '1px solid rgba(45,138,138,0.2)',"
);

// Copy Summary button fontSize 11px
c = c.replace(
  "fontSize: '11px',\n                color: copiedSummary ? 'var(--green)' : 'var(--slate)',",
  "fontSize: 'var(--label-size)',\n                color: copiedSummary ? 'var(--green)' : 'var(--slate)',"
);

// Facilitator name span fontSize 13px (value)
c = c.replace(
  "<span style={{ fontSize: '13px', color: 'var(--ink)' }}>\n                    {facilitatorInfo.name}",
  "<span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)' }}>\n                    {facilitatorInfo.name}"
);

// 'Projects discussed' label — fontSize 10px, opacity 0.55, fontWeight 500
c = c.replace(
  "{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }>\n              Projects discussed",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--label-weight)' }>\n              Projects discussed"
);

// 'Prepared agenda' label — fontSize 11px, fontWeight 500, opacity 0.65
c = c.replace(
  "{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '8px' }>\n                    Prepared agenda",
  "{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '8px' }>\n                    Prepared agenda"
);

// Agenda list item fontSize 13px
c = c.replace(
  "{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6, marginBottom: '4px' }",
  "{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.6, marginBottom: '4px' }"
);

// 'Team-added items' label — fontSize 11px, fontWeight 500, opacity 0.65
c = c.replace(
  "{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '8px' }>\n                    Team-added items",
  "{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '8px' }>\n                    Team-added items"
);

// Action count span — fontSize 11px, opacity 0.6 (close to label)
c = c.replace(
  "{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }>\n                {completedActions.length}/{actionItems.length}",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }>\n                {completedActions.length}/{actionItems.length}"
);

// 'Completed' section label — fontSize 11px, fontWeight 500, opacity 0.65
c = c.replace(
  "{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65, marginBottom: '6px' }>\n                    Completed",
  "{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginBottom: '6px' }>\n                    Completed"
);

// 'No action items yet' empty state — fontSize 12px, opacity 0.55
c = c.replace(
  "{ fontSize: '12px', color: 'var(--slate)', opacity: 0.55, textAlign: 'center', padding: '16px 0', margin: 0 }>\n                  No action items yet",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: '16px 0', margin: 0 }>\n                  No action items yet"
);

// Decision input fontSize 13px
c = c.replace(
  "width: '100%', fontSize: '13px', color: 'var(--ink)',\n                      background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8,\n                      padding: '8px 12px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box',",
  "width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)',\n                      background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8,\n                      padding: '8px 12px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box',"
);

// Decision text fontSize 13px
c = c.replace(
  "{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{d}</p>",
  "{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>{d}</p>"
);

// 'No decisions logged yet' empty state — fontSize 12px, opacity 0.55
c = c.replace(
  "{ fontSize: '12px', color: 'var(--slate)', opacity: 0.55, textAlign: 'center', padding: '16px 0', margin: 0 }>\n              No decisions logged yet.",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: '16px 0', margin: 0 }>\n              No decisions logged yet."
);

// 'Ctrl+Enter to save' hint — fontSize 10px, opacity 0.5 (hint)
c = c.replace(
  "{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }>\n                    Ctrl+Enter to save",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }>\n                    Ctrl+Enter to save"
);

// 'No notes yet' placeholder — fontSize 13px, opacity 0.5 (not a completed item)
c = c.replace(
  "{ fontSize: '13px', color: 'var(--slate)', opacity: 0.5, fontStyle: 'italic', margin: 0, cursor: 'pointer' }",
  "{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontStyle: 'italic', margin: 0, cursor: 'pointer' }"
);

// SortableAgendaItem content fontSize 13px
c = c.replace(
  "{ fontSize: '13px', color: 'var(--ink)', margin: 0 }}>{item.content}</p>",
  "{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0 }}>{item.content}</p>"
);

// 'Added by' hint — fontSize 10px, opacity 0.5
c = c.replace(
  "{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }>\n          Added by",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-hint)' }>\n          Added by"
);

// Action item description fontSize 13px (keep completed opacity as is)
c = c.replace(
  "{ fontSize: '13px', color: 'var(--ink)', margin: 0, lineHeight: 1.4, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }",
  "{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0, lineHeight: 1.4, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }"
);

// AddActionItemForm input fontSize 13px
c = c.replace(
  "flex: 1, fontSize: '13px', color: 'var(--ink)',\n            background: 'var(--cream)',",
  "flex: 1, fontSize: 'var(--value-size)', color: 'var(--ink)',\n            background: 'var(--cream)',"
);

// AddAgendaForm input fontSize 13px
c = c.replace(
  "width: '100%', fontSize: '13px', color: 'var(--ink)',\n              background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: '8px',",
  "width: '100%', fontSize: 'var(--value-size)', color: 'var(--ink)',\n              background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: '8px',"
);

// AttendanceSection Users icon opacity 0.55
c = c.replace(
  "{ color: 'var(--slate)', opacity: 0.55, flexShrink: 0 }} />",
  "{ color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }} />"
);

// 'Attendees' label — fontSize 10px, opacity 0.55, fontWeight 500
c = c.replace(
  "{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }>\n          Attendees",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--label-weight)' }>\n          Attendees"
);

// Attendee count — fontSize 10px, opacity 0.55
c = c.replace(
  "{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55 }>\n          {localAttendees.length}",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }>\n          {localAttendees.length}"
);

// 'No attendees logged' — fontSize 11px, opacity 0.55
c = c.replace(
  "{ fontSize: '11px', color: 'var(--slate)', opacity: 0.55 }}>No attendees logged</span>",
  "{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No attendees logged</span>"
);

if (c === orig) {
  console.log('NO CHANGES MADE');
} else {
  fs.writeFileSync('src/pages/MeetingDetail.tsx', c);
  console.log('Done - changes applied');
}
