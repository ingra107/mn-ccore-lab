// Display names for publication topic tags, in one place. A topic missing from
// the map shows capitalized, never raw.
const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

export function topicLabel(topic: string): string {
  return TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1)
}
