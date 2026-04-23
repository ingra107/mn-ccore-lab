type PromptCategory = 'reflection' | 'wins' | 'challenges' | 'learning' | 'connection'

interface RoundPrompt {
  text: string
  category: PromptCategory
}

export const ROUND_PROMPTS: RoundPrompt[] = [
  // Reflection
  { text: "What's one thing you learned this week that surprised you?", category: 'reflection' },
  { text: "What's been on your mind since our last meeting?", category: 'reflection' },
  { text: "What's a decision you made recently that you'd approach differently now?", category: 'reflection' },
  { text: "What's one thing you wish you had more time to think about?", category: 'reflection' },
  { text: "How's your energy going into this meeting — and what's one thing currently on your plate?", category: 'reflection' },
  { text: "What's one word that captures where you are in your work right now?", category: 'reflection' },

  // Wins
  { text: "Share a small win from the past two weeks — big or small.", category: 'wins' },
  { text: "What's something you accomplished recently that you haven't told anyone yet?", category: 'wins' },
  { text: "What's a moment of progress you almost missed noticing?", category: 'wins' },
  { text: "What's one thing that went better than expected lately?", category: 'wins' },
  { text: "What's the best thing you've read, heard, or seen in the past month?", category: 'wins' },

  // Challenges
  { text: "What's blocking you right now — and is there anyone here who could help?", category: 'challenges' },
  { text: "What's the hardest problem you're working on this month?", category: 'challenges' },
  { text: "Where do you feel most stuck in your current work?", category: 'challenges' },
  { text: "What's something you've been putting off, and why?", category: 'challenges' },
  { text: "What's a fear or uncertainty you're sitting with in your research right now?", category: 'challenges' },
  { text: "What's a tradeoff you've been wrestling with — where there's no clearly right answer?", category: 'challenges' },

  // Learning
  { text: "What's a paper, talk, or idea you've been thinking about lately?", category: 'learning' },
  { text: "What question are you most curious about in your research right now?", category: 'learning' },
  { text: "What's something you want to learn that you haven't started yet?", category: 'learning' },
  { text: "What's the last thing that genuinely changed how you think about your work?", category: 'learning' },
  { text: "If you could design any study with unlimited resources, what would you investigate?", category: 'learning' },
  { text: "What's a question you think the field is ignoring that it shouldn't be?", category: 'learning' },

  // Connection
  { text: "What's one thing you need from this group that you haven't asked for?", category: 'connection' },
  { text: "What's something you wish others on the team knew about what you're working on?", category: 'connection' },
  { text: "Who in the research world — past or present — would you most want to collaborate with, and why?", category: 'connection' },
  { text: "What's one thing outside of work that's been energizing you lately?", category: 'connection' },
  { text: "What's the best thing about working in critical care research, for you personally?", category: 'connection' },
]

/** Deterministic djb2-style hash of a meeting ID into index */
export function hashMeetingId(meetingId: string, total: number): number {
  let h = 5381
  for (let i = 0; i < meetingId.length; i++) {
    h = ((h << 5) + h + meetingId.charCodeAt(i)) & 0x7fffffff
  }
  return ((h % total) + total) % total
}

export const CATEGORY_LABELS: Record<PromptCategory, string> = {
  reflection: 'Reflection',
  wins: 'Wins',
  challenges: 'Challenges',
  learning: 'Learning',
  connection: 'Connection',
}
