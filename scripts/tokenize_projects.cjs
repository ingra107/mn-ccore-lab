const fs = require('fs');
let c = fs.readFileSync('src/pages/Projects.tsx', 'utf8');
const orig = c;

// Category filter pills — fontWeight 500, fontSize '12px' -> label tokens
c = c.replace(
  "                  style={{\n                    fontWeight: 500,\n                    fontSize: '12px',\n                    borderRadius: '6px',",
  "                  style={{\n                    fontWeight: 'var(--label-weight)',\n                    fontSize: 'var(--label-size)',\n                    borderRadius: '6px',"
);

// Dependencies button — fontSize '11px', fontWeight 500
c = c.replace(
  "                  fontSize: '11px',\n                  fontWeight: 500,\n                  background: showDeps ? 'var(--teal)'",
  "                  fontSize: 'var(--label-size)',\n                  fontWeight: 'var(--label-weight)',\n                  background: showDeps ? 'var(--teal)'"
);

// Stage group header span — fontSize '11px', fontWeight 500, opacity 0.55
c = c.replace(
  "                              style={{\n                                fontSize: '11px',\n                                fontWeight: 500,\n                                color: 'var(--slate)',\n                                opacity: 0.55,\n                                textTransform: 'uppercase',\n                                letterSpacing: '0.06em',\n                                flexShrink: 0,\n                              }}",
  "                              style={{\n                                fontSize: 'var(--label-size)',\n                                fontWeight: 'var(--label-weight)',\n                                color: 'var(--slate)',\n                                opacity: 'var(--ink-label)',\n                                textTransform: 'uppercase',\n                                letterSpacing: '0.06em',\n                                flexShrink: 0,\n                              }}"
);

// 'No projects in this category' — opacity 0.55
c = c.replace(
  "                  style={{\n                    fontSize: '14px',\n                    color: 'var(--slate)',\n                    opacity: 0.55,\n                  }}",
  "                  style={{\n                    fontSize: '14px',\n                    color: 'var(--slate)',\n                    opacity: 'var(--ink-label)',\n                  }}"
);

// Calculations row gap: 20
c = c.replace(
  "                  display: 'flex',\n                  gap: 20,\n                  padding: '8px 24px',",
  "                  display: 'flex',\n                  gap: 'var(--sp-xl)',\n                  padding: '8px 24px',"
);

// Calculations row spans — fontSize '11px', opacity 0.6
c = c.replace(
  "                  <span key={s.label} style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>",
  "                  <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>"
);

// Pipeline gap '16px' (outer grid gap between columns)
c = c.replace(
  "                gap: '16px',\n                overflowX: 'auto',",
  "                gap: 'var(--sp-lg)',\n                overflowX: 'auto',"
);

// Pipeline cards stagger container gap '12px'
c = c.replace(
  "              style={{ gap: '12px' }}\n                      variants={staggerContainer}",
  "              style={{ gap: 'var(--sp-md)' }}\n                      variants={staggerContainer}"
);

// Pipeline column count label — fontSize '12px', opacity 0.55, fontWeight 500
c = c.replace(
  "                        <span\n                          style={{\n                            fontSize: '12px',\n                            color: 'var(--slate)',\n                            opacity: 0.55,\n                            fontWeight: 500,\n                          }}",
  "                        <span\n                          style={{\n                            fontSize: 'var(--label-size)',\n                            color: 'var(--slate)',\n                            opacity: 'var(--ink-label)',\n                            fontWeight: 'var(--label-weight)',\n                          }}"
);

// 'No projects' pipeline empty state — opacity 0.5
c = c.replace(
  "                            style={{\n                                fontSize: '12px',\n                                color: 'var(--slate)',\n                                opacity: 0.5,\n                              }}",
  "                            style={{\n                                fontSize: 'var(--label-size)',\n                                color: 'var(--slate)',\n                                opacity: 'var(--ink-label)',\n                              }}"
);

if (c === orig) {
  console.log('NO CHANGES MADE');
} else {
  fs.writeFileSync('src/pages/Projects.tsx', c);
  console.log('Done - changes applied');
}
