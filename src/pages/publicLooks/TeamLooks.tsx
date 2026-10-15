import { Link } from 'react-router-dom'
import { useLab, Who, fullName, AREAS, type Look, type Person } from './lab'

const GROUPS: { id: Person['group']; label: string }[] = [
  { id: 'directors', label: 'Co-directors' },
  { id: 'mentors', label: 'Senior mentors' },
  { id: 'faculty', label: 'Faculty collaborators' },
  { id: 'team', label: 'Research team' },
]

const first = (n: string) => n.split(' ')[0]

/* ───────── A: Portal-native ───────── */
function TeamA() {
  const lab = useLab()
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="pl-h1">Team</h1>
            <p className="pl-sub">{lab.people.length} physicians, scientists and research staff.</p>
          </div>
          <div className="pl-seg"><span className="on">Everyone</span><span>Faculty</span><span>Staff</span><span>Trainees</span></div>
        </div>
        {GROUPS.map(g => {
          const list = lab.people.filter(p => p.group === g.id)
          return (
            <div key={g.id}>
              <div className="pl-hd">{g.label} <span className="pl-t3" style={{ fontWeight: 400 }}>{list.length}</span></div>
              {g.id === 'directors' ? (
                <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                  {list.map(p => (
                    <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-card pl-hov" style={{ padding: 16, display: 'flex', gap: 14 }}>
                      <Who m={p.m} px={56} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{fullName(p.m)}</div>
                        <div className="pl-t2" style={{ fontSize: 12, marginTop: 1 }}>{(p.m as { title?: string }).title ?? p.m.role}</div>
                        <div className="pl-t3" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{p.m.bio}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="pl-card" style={{ padding: 6 }}>
                  {list.map(p => (
                    <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-row">
                      <Who m={p.m} px={26} />
                      <span className="ti" style={{ flex: '0 0 auto', minWidth: 150 }}>{fullName(p.m)}</span>
                      <span className="me" style={{ flex: 1 }}>{p.m.role}</span>
                      <span className="me hide-m">{p.pubs ? `${p.pubs} ${p.pubs === 1 ? "paper" : "papers"}` : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────── B: Editorial ───────── */
function TeamB() {
  const lab = useLab()
  const dirs = lab.people.filter(p => p.group === 'directors')
  return (
    <div className="pl pl-page" style={{ background: 'color-mix(in srgb, var(--sk-page) 70%, var(--sk-panel))' }}>
      <div className="pl-wrap">
        <div style={{ paddingTop: 24 }}>
          <div className="plb-kick">The people</div>
          <h1 className="plb-h1" style={{ fontSize: 'clamp(36px, 5vw, 60px)' }}>Who we <em>are</em>.</h1>
          <p className="plb-lede">Physicians, scientists and research staff, working across {lab.people.length} roles on one question: how to make ICU care better.</p>
        </div>
        <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 30 }}>
          {dirs.map(p => (
            <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-card pl-hov" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: '#0e1319', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <Who m={p.m} px={72} ring />
                <div>
                  <div style={{ font: '500 24px var(--font-display)', color: '#eef1f4', letterSpacing: '-.02em' }}>{fullName(p.m)}</div>
                  <div style={{ fontSize: 12, color: '#dcb355', marginTop: 3 }}>{p.m.role}</div>
                </div>
              </div>
              <div style={{ padding: '16px 22px 20px' }}>
                <div className="pl-t2" style={{ font: 'italic 400 14px var(--font-display)' }}>{(p.m as { title?: string }).title}</div>
                <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--sk-t1)' }}>{p.m.bio}</p>
              </div>
            </Link>
          ))}
        </div>
        {GROUPS.filter(g => g.id !== 'directors').map(g => {
          const list = lab.people.filter(p => p.group === g.id)
          return (
            <div key={g.id}>
              <div className="plb-sec">{g.label}</div>
              <div style={{ columnWidth: 280, columnGap: 36, marginTop: 10 }}>
                {list.map(p => (
                  <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-row" style={{ breakInside: 'avoid', padding: '9px 6px' }}>
                    <Who m={p.m} px={34} />
                    <span style={{ minWidth: 0 }}>
                      <span className="plb-rt" style={{ display: 'block', fontSize: 16 }}>{fullName(p.m)}</span>
                      <span className="pl-t3" style={{ fontSize: 12, fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{p.m.role}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────── C: Lab-forward ───────── */
function TeamC() {
  const lab = useLab()
  const maxP = Math.max(1, ...lab.people.map(p => p.pubs))
  const papers = lab.counts.published
  const sorted = [...lab.people].sort((a, b) => b.pubs - a.pubs)
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <h1 className="pl-h1">Team</h1>
        <div className="pl-nums" style={{ margin: '18px 0 4px' }}>
          <div className="pl-num"><b>{lab.people.length}</b><small>People</small></div>
          <div className="pl-num"><b>{papers}</b><small>Lab publications</small></div>
          <div className="pl-num"><b>{lab.people.filter(p => p.group === 'team' || p.group === 'faculty').length}</b><small>Collaborators and staff</small></div>
        </div>
        <div className="pl-hd">Everyone, by papers with the lab</div>
        <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}>
          {sorted.map(p => (
            <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-card pl-hov" style={{ padding: '16px 12px 12px', textAlign: 'center' }}>
              <Who m={p.m} px={72} />
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{p.m.name}</div>
              <div className="pl-t3" style={{ fontSize: 11, marginTop: 1, minHeight: 28 }}>{p.m.role}</div>
              <div style={{ marginTop: 8 }}>
                <div className="pl-bar"><i style={{ width: `${(p.pubs / maxP) * 100}%` }} /></div>
                <div className="pl-t2" style={{ fontSize: 11, marginTop: 4 }}>{p.pubs} {p.pubs === 1 ? 'paper' : 'papers'}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── D: Who to ask ───────── */
function TeamD() {
  const lab = useLab()
  const bySlug = new Map(lab.people.map(p => [p.m.slug, p]))
  // Sample routing for the mockup; the real one would come from expertise tags + a stated contact role.
  const routes = [
    { q: 'I want to train or do a project here', slugs: ['nick-ingraham', 'claire-collins'] },
    { q: 'I want to collaborate or bring my site into CLIF', slugs: ['nate-mesfin', 'casey-eddington'] },
    { q: 'I want to run a quality-measurement study', slugs: ['adams-dudley', 'jeff-chipman'] },
    { q: 'I need data, code or the study schedule', slugs: ['casey-eddington', 'steven-arriaza', 'emma-bromley'] },
  ]
  const rest = lab.people.filter(p => !routes.some(r => r.slugs.includes(p.m.slug ?? '')))
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <h1 className="pl-h1" style={{ fontSize: 'clamp(30px, 4vw, 42px)' }}>Who to talk to</h1>
        <p className="pl-sub" style={{ fontSize: 15 }}>Tell us what you need. These are the people who will answer.</p>
        <div className="pl-grid" style={{ marginTop: 22, gap: 12 }}>
          {routes.map(r => (
            <div key={r.q} className="pl-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ font: '600 17px var(--font-display)', letterSpacing: '-.01em', flex: '1 1 260px' }}>{r.q}</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {r.slugs.map(s => bySlug.get(s)).filter((p): p is Person => !!p).map(p => (
                  <Link key={p.m.slug} to={`/team/${p.m.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Who m={p.m} px={40} />
                    <span style={{ fontSize: 13 }}><b style={{ fontWeight: 600 }}>{first(p.m.name)}</b><span className="pl-t3" style={{ display: 'block', fontSize: 11 }}>{p.m.role}</span></span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pl-hd" style={{ marginTop: 34 }}>Everyone else, by what they work on</div>
        <div className="pl-card" style={{ padding: 6 }}>
          {rest.map((p, i) => (
            <Link key={p.m.slug} to={`/team/${p.m.slug}`} className="pl-row">
              <Who m={p.m} px={24} />
              <span className="ti" style={{ flex: '0 0 auto', minWidth: 140 }}>{fullName(p.m)}</span>
              <span className="me hide-m" style={{ flex: 1 }}>{(lab.tagsByMember.get(p.m.slug ?? '') ?? [AREAS[i % 4].t]).slice(0, 3).join(' · ')}</span>
              <span className="me">{p.m.role}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TeamLook({ look }: { look: Look }) {
  return look === 'a' ? <TeamA /> : look === 'b' ? <TeamB /> : look === 'c' ? <TeamC /> : <TeamD />
}
