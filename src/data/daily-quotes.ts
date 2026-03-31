// Daily motivational quotes — Stoic philosophy, productivity wisdom, research/science
// Index by dayOfYear % length for deterministic daily rotation

export interface DailyQuote {
  text: string
  author: string
}

export const dailyQuotes: DailyQuote[] = [
  // Stoic Philosophy
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "How long are you going to wait before you demand the best for yourself?", author: "Epictetus" },
  { text: "It is not that we have a short time to live, but that we waste a great deal of it.", author: "Seneca" },
  { text: "The happiness of your life depends upon the quality of your thoughts.", author: "Marcus Aurelius" },
  { text: "No person has the power to have everything they want, but it is in their power not to want what they don't have.", author: "Seneca" },
  { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "Begin at once to live, and count each separate day as a separate life.", author: "Seneca" },
  { text: "If it is not right, do not do it; if it is not true, do not say it.", author: "Marcus Aurelius" },
  { text: "The soul becomes dyed with the color of its thoughts.", author: "Marcus Aurelius" },
  { text: "He who fears death will never do anything worthy of a living man.", author: "Seneca" },
  { text: "Difficulties strengthen the mind, as labor does the body.", author: "Seneca" },
  { text: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.", author: "Seneca" },
  { text: "The best revenge is not to be like your enemy.", author: "Marcus Aurelius" },
  { text: "Make the best use of what is in your power, and take the rest as it happens.", author: "Epictetus" },
  { text: "He who is brave is free.", author: "Seneca" },
  { text: "Think of the life you have lived until now as over and done. Now view what's left as a bonus and live it well.", author: "Marcus Aurelius" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },

  // Deep Work & Productivity
  { text: "A deep life is a good life.", author: "Cal Newport" },
  { text: "Clarity about what matters provides clarity about what does not.", author: "Cal Newport" },
  { text: "The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable.", author: "Cal Newport" },
  { text: "What we choose to focus on and what we choose to ignore — plays in defining the quality of our life.", author: "Cal Newport" },
  { text: "If you don't produce, you won't thrive — no matter how skilled or talented you are.", author: "Cal Newport" },
  { text: "To do real good physics work, you do need absolute solid lengths of time.", author: "Richard Feynman" },
  { text: "Productivity is not about getting more things done; it's about getting the right things done.", author: "Tim Ferriss" },
  { text: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "Every action you take is a vote for the type of person you wish to become.", author: "James Clear" },
  { text: "Plans are useless, but planning is indispensable.", author: "Dwight Eisenhower" },
  { text: "Work expands so as to fill the time available for its completion.", author: "Cyril Parkinson" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "One can have no smaller or greater mastery than mastery of oneself.", author: "Leonardo da Vinci" },
  { text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.", author: "Stephen King" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },

  // Science & Research
  { text: "If I have seen further, it is by standing on the shoulders of giants.", author: "Isaac Newton" },
  { text: "The important thing is not to stop questioning. Curiosity has its own reason for existing.", author: "Albert Einstein" },
  { text: "In God we trust; all others must bring data.", author: "W. Edwards Deming" },
  { text: "The first principle is that you must not fool yourself — and you are the easiest person to fool.", author: "Richard Feynman" },
  { text: "Research is what I'm doing when I don't know what I'm doing.", author: "Wernher von Braun" },
  { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan" },
  { text: "The good physician treats the disease; the great physician treats the patient who has the disease.", author: "William Osler" },
  { text: "Listen to the patient, he is telling you the diagnosis.", author: "William Osler" },
  { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan" },
  { text: "The measure of intelligence is the ability to change.", author: "Albert Einstein" },
  { text: "Not everything that counts can be counted, and not everything that can be counted counts.", author: "William Bruce Cameron" },
  { text: "The greatest enemy of knowledge is not ignorance, it is the illusion of knowledge.", author: "Daniel Boorstin" },
  { text: "Essentially, all models are wrong, but some are useful.", author: "George Box" },
  { text: "An approximate answer to the right problem is worth a good deal more than an exact answer to an approximate problem.", author: "John Tukey" },
  { text: "The plural of anecdote is not data.", author: "Roger Brinner" },
  { text: "If you torture the data long enough, it will confess to anything.", author: "Ronald Coase" },
  { text: "Far better an approximate answer to the right question than an exact answer to the wrong question.", author: "John Tukey" },
  { text: "It is a capital mistake to theorize before one has data.", author: "Arthur Conan Doyle" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },

  // Leadership & Mentorship
  { text: "A leader is best when people barely know he exists. When his work is done, they will say: we did it ourselves.", author: "Lao Tzu" },
  { text: "The task of leadership is not to put greatness into people, but to elicit it, for the greatness is there already.", author: "John Buchan" },
  { text: "Before you are a leader, success is all about growing yourself. When you become a leader, success is all about growing others.", author: "Jack Welch" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
  { text: "The whole is greater than the sum of its parts.", author: "Aristotle" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },

  // Resilience & Perseverance
  { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
  { text: "He who has a why to live for can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin Roosevelt" },
  { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
  { text: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "The gem cannot be polished without friction, nor man perfected without trials.", author: "Seneca" },
  { text: "Courage is not the absence of fear, but rather the judgment that something else is more important.", author: "Ambrose Redmoon" },

  // Medicine & Critical Care
  { text: "The art of medicine consists in amusing the patient while nature cures the disease.", author: "Voltaire" },
  { text: "Wherever the art of medicine is loved, there is also a love of humanity.", author: "Hippocrates" },
  { text: "The physician's highest calling, his only calling, is to make sick people healthy — to heal, as it is termed.", author: "Samuel Hahnemann" },
  { text: "To study the phenomena of disease without books is to sail an uncharted sea, while to study books without patients is not to go to sea at all.", author: "William Osler" },
  { text: "Medicine is a science of uncertainty and an art of probability.", author: "William Osler" },
  { text: "One of the first duties of the physician is to educate the masses not to take medicine.", author: "William Osler" },
  { text: "The capacity to blunder slightly is the real marvel of DNA. Without this special attribute, we would still be anaerobic bacteria.", author: "Lewis Thomas" },
  { text: "Life is short, the art long, opportunity fleeting, experiment treacherous, judgment difficult.", author: "Hippocrates" },

  // Focus & Mindfulness
  { text: "Attention is the rarest and purest form of generosity.", author: "Simone Weil" },
  { text: "Where attention goes, energy flows.", author: "Tony Robbins" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "Be tolerant with others and strict with yourself.", author: "Marcus Aurelius" },
  { text: "Well-being is attained by little and little, and nevertheless is no little thing itself.", author: "Zeno of Citium" },
  { text: "Yesterday is history, tomorrow is a mystery, today is a gift. That is why it is called the present.", author: "Alice Morse Earle" },
  { text: "The present moment is filled with joy and happiness. If you are attentive, you will see it.", author: "Thich Nhat Hanh" },
  { text: "Between stimulus and response there is a space. In that space is our freedom and power to choose our response.", author: "Viktor Frankl" },
]

/** Get today's quote (deterministic — same quote all day) */
export function getDailyQuote(date?: string): DailyQuote {
  const d = date ? new Date(date + 'T12:00:00') : new Date()
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
  return dailyQuotes[dayOfYear % dailyQuotes.length]
}
