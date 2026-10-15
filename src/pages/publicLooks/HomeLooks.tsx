import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useLab, Who, fullName, AREAS, type Look } from './lab'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../../data/team'
import { PATHS } from '../../constants/paths'

const nPeople = directors.length + seniorMentors.length + facultyCollaborators.length + researchTeam.length

function Num({ v, l }: { v: number | string; l: string }) {
  return <div className="pl-num"><b>{v}</b><small>{l}</small></div>
}

/* ───────── A: Portal-native ───────── */
function HomeA() {
  const lab = useLab()
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="pl-h1">MN-CCORE</h1>
            <p className="pl-sub">Minnesota Critical Care Outcomes and Research Effort. We study how ICU care is delivered, measured and improved, with 13 consortium sites.</p>
            <div style={{ height: 2, width: 40, background: 'var(--sk-gold)', borderRadius: 2, marginTop: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="pl-btn" to="/publications">Publications</Link>
            <a className="pl-btn ac" href={PATHS.dashboard}>Open Hub <ArrowRight size={14} /></a>
          </div>
        </div>
        <div className="pl-nums" style={{ margin: '26px 0 6px' }}>
          <Num v={lab.counts.published} l="Publications" />
          <Num v={lab.active.length} l="Active projects" />
          <Num v="13+" l="Consortium sites" />
          <Num v={nPeople} l="People" />
        </div>
        <div className="pl-cols" style={{ marginTop: 8 }}>
          <div>
            <div className="pl-hd">Recent publications</div>
            <div className="pl-card" style={{ padding: 8 }}>
              {lab.recent.map(p => (
                <Link key={p.id} to={`/publications/${p.id}`} className="pl-row">
                  <span className="ti">{p.title}</span>
                  <span className="me hide-m">{p.journal}</span>
                  <span className="me">{p.year}</span>
                </Link>
              ))}
            </div>
            <div className="pl-hd">The consortium</div>
            <div className="pl-card" style={{ padding: 18, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>CLIF Consortium</div>
                <div className="pl-t2" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Thirteen academic medical centers contribute harmonized ICU data through the Common Longitudinal ICU Format.</div>
              </div>
              <Link className="pl-btn" to="/network">See the network</Link>
            </div>
          </div>
          <div>
            <div className="pl-hd">Research areas</div>
            <div className="pl-card" style={{ padding: 14 }}>
              {AREAS.map((a, i) => (
                <div key={a.t} style={{ padding: '10px 4px', borderTop: i ? '1px solid var(--sk-line)' : 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.t}</div>
                  <div className="pl-t3" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{a.d}</div>
                </div>
              ))}
            </div>
            <div className="pl-hd">People</div>
            <div className="pl-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lab.people.slice(0, 14).map(p => <Who key={p.m.slug} m={p.m} px={32} />)}
              </div>
              <Link to="/team" className="pl-t2" style={{ display: 'inline-block', marginTop: 12, fontSize: 12 }}>Meet the team</Link>
            </div>
            <div className="pl-hd">Join</div>
            <Link to="/contact" className="pl-card pl-hov" style={{ padding: 14, display: 'block' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Work with us</div>
              <div className="pl-t3" style={{ fontSize: 12, marginTop: 2 }}>Trainees and collaborators, start here.</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── B: Editorial ───────── */
function HomeB() {
  const lab = useLab()
  return (
    <div className="pl pl-page" style={{ background: 'color-mix(in srgb, var(--sk-page) 70%, var(--sk-panel))' }}>
      <div className="pl-wrap">
        <div style={{ paddingTop: 28 }}>
          <div className="plb-kick">University of Minnesota</div>
          <h1 className="plb-h1">Critical care research,<br />done <em>together</em>.</h1>
          <p className="plb-lede">We study how ICU care is delivered, measured and improved, from one clinician's decision to a thirteen-site data consortium.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <Link className="pl-btn ac" to="/publications">Read the work</Link>
            <Link className="pl-btn" to="/team">Meet the team</Link>
          </div>
        </div>
        <div className="plb-band" style={{ marginTop: 40 }}>
          <div><b>{lab.counts.published}</b><small>Publications</small></div>
          <div><b>{lab.active.length}</b><small>Active projects</small></div>
          <div><b>13+</b><small>Consortium sites</small></div>
          <div><b>{nPeople}</b><small>People</small></div>
        </div>

        <div className="plb-sec">Selected work</div>
        <div className="pl-card" style={{ padding: 8, marginTop: 12 }}>
          {(lab.featured.length ? lab.featured : lab.recent.slice(0, 4)).map(p => (
            <Link key={p.id} to={`/publications/${p.id}`} className="pl-row" style={{ alignItems: 'baseline', padding: '14px 12px' }}>
              <span className="plb-yr">{p.year}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="plb-rt" style={{ display: 'block' }}>{p.title}</span>
                <span className="pl-t3" style={{ fontSize: 12, fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{p.journal}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="plb-sec">What we study</div>
        <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
          {AREAS.map((a, i) => (
            <div key={a.t} style={{ borderTop: '1px solid var(--sk-line2)', paddingTop: 12 }}>
              <div className="plb-yr" style={{ width: 'auto' }}>0{i + 1}</div>
              <div className="plb-rt" style={{ margin: '4px 0 6px' }}>{a.t}</div>
              <div className="pl-t2" style={{ fontSize: 13, lineHeight: 1.55 }}>{a.d}</div>
            </div>
          ))}
        </div>

        <div className="plb-sec">The people</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', marginTop: 14 }}>
          {lab.people.slice(0, 8).map(p => (
            <div key={p.m.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Who m={p.m} px={36} ring />
              <div>
                <div className="plb-rt" style={{ fontSize: 15 }}>{p.m.name}</div>
                <div className="pl-t3" style={{ fontSize: 12 }}>{p.m.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ───────── C: Lab-forward ───────── */
function HomeC() {
  const lab = useLab()
  const maxY = Math.max(1, ...lab.byYear.map(y => y.n))
  const maxT = Math.max(1, ...lab.topics.map(t => t[1]))
  const thisYear = lab.byYear[lab.byYear.length - 1]
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <h1 className="pl-h1">MN-CCORE</h1>
        <p className="pl-sub">What the lab produced, what it is working on, and who does it.</p>

        <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 20 }}>
          <div className="pl-card" style={{ padding: 20 }}>
            <div className="pl-num" style={{ paddingBottom: 10 }}><b style={{ fontSize: 56 }}>{lab.counts.published}</b><small>Published papers</small></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64, marginTop: 14 }}>
              {lab.byYear.map(y => (
                <div key={y.year} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: Math.max(3, (y.n / maxY) * 48), borderRadius: 3, background: 'linear-gradient(180deg, var(--sk-ramp-hi), var(--sk-ramp-dim))' }} />
                  <div className="pl-t3" style={{ fontSize: 10, marginTop: 4 }}>{String(y.year).slice(2)}</div>
                </div>
              ))}
            </div>
            <div className="pl-t2" style={{ fontSize: 12, marginTop: 8 }}>{thisYear.n} so far in {thisYear.year}</div>
          </div>
          <div className="pl-card" style={{ padding: 20 }}>
            <div className="pl-num" style={{ paddingBottom: 10 }}><b style={{ fontSize: 56 }}>{lab.active.length}</b><small>Active projects</small></div>
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {lab.active.slice(0, 4).map(p => <div key={p.slug} className="pl-t2" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.short_name || p.title}</div>)}
            </div>
          </div>
          <div className="pl-card" style={{ padding: 20 }}>
            <div className="pl-num" style={{ paddingBottom: 10 }}><b style={{ fontSize: 56 }}>13+</b><small>Consortium sites sharing ICU data</small></div>
            <Link to="/network" className="pl-t2" style={{ display: 'inline-block', marginTop: 28, fontSize: 12 }}>See the network</Link>
          </div>
        </div>

        <div className="pl-cols">
          <div>
            <div className="pl-hd">Research areas, by published papers</div>
            <div className="pl-card" style={{ padding: 8 }}>
              {lab.topics.map(([t, n]) => (
                <Link key={t} to={`/publications?topic=${encodeURIComponent(t)}`} className="pl-row" style={{ padding: '12px' }}>
                  <span className="ti" style={{ flex: '0 0 38%', textTransform: 'capitalize' }}>{t === 'clif' ? 'CLIF' : t === 'covid' ? 'COVID-19' : t}</span>
                  <span className="pl-bar" style={{ flex: 1 }}><i style={{ width: `${(n / maxT) * 100}%` }} /></span>
                  <span className="me" style={{ width: 28, textAlign: 'right' }}>{n}</span>
                </Link>
              ))}
              {lab.topics.length === 0 && <div className="pl-t3" style={{ padding: 16, fontSize: 13 }}>Loading topics</div>}
            </div>
          </div>
          <div>
            <div className="pl-hd">The people</div>
            <div className="pl-card" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {lab.people.slice(0, 12).map(p => (
                  <Link key={p.m.slug} to={`/team/${p.m.slug}`} style={{ textAlign: 'center' }}>
                    <Who m={p.m} px={52} />
                    <div style={{ fontSize: 11, marginTop: 5, fontWeight: 500 }}>{p.m.name.split(' ')[0]}</div>
                  </Link>
                ))}
              </div>
              <Link to="/team" className="pl-t2" style={{ display: 'inline-block', marginTop: 14, fontSize: 12 }}>All {nPeople} people</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── D: Front door (intent-led) ───────── */
function HomeD() {
  const lab = useLab()
  const nick = directors[0]; const nate = directors[1]
  const doors = [
    { k: 'Train with us', q: 'I am a student, resident or fellow', fact: `${researchTeam.length} trainees and staff on the team now`, who: nick, to: '/contact', cta: 'Talk to Nick' },
    { k: 'Work with us', q: 'I want to collaborate or join the consortium', fact: '13+ sites share ICU data through CLIF', who: nate, to: '/network', cta: 'See the network' },
    { k: 'Read the work', q: 'I want the papers, methods and code', fact: `${lab.counts.published} published papers, ${lab.active.length} active projects`, who: seniorMentors[0], to: '/publications', cta: 'Browse publications' },
  ]
  return (
    <div className="pl pl-page">
      <div className="pl-wrap">
        <div style={{ paddingTop: 20 }}>
          <div className="pl-t3" style={{ fontSize: 12, fontWeight: 600 }}>MN-CCORE &middot; University of Minnesota</div>
          <h1 className="pl-h1" style={{ fontSize: 'clamp(34px, 5vw, 52px)', marginTop: 8, lineHeight: 1.05 }}>What brings you here?</h1>
          <p className="pl-sub" style={{ fontSize: 16 }}>A critical care research lab. Pick the door that fits and you land on a person, not a menu.</p>
        </div>
        <div className="pl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 28 }}>
          {doors.map(d => (
            <Link key={d.k} to={d.to} className="pl-card pl-hov" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 250 }}>
              <div style={{ font: '600 22px var(--font-display)', letterSpacing: '-.02em' }}>{d.k}</div>
              <div className="pl-t2" style={{ fontSize: 13 }}>{d.q}</div>
              <div className="pl-t3" style={{ fontSize: 12, borderTop: '1px solid var(--sk-line)', paddingTop: 10, marginTop: 4 }}>{d.fact}</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px 10px', flexWrap: 'wrap' }}>
                <Who m={d.who} px={30} />
                <div style={{ flex: 1, fontSize: 12 }}><b style={{ fontWeight: 600 }}>{d.who.name}</b><div className="pl-t3">{d.who.role}</div></div>
                <span style={{ color: 'var(--sk-ac)', fontSize: 12, fontWeight: 600, display: 'inline-flex', gap: 4, alignItems: 'center' }}>{d.cta} <ArrowRight size={13} /></span>
              </div>
            </Link>
          ))}
        </div>
        <div className="pl-hd" style={{ marginTop: 36 }}>Or ask a person who works on it</div>
        <div className="pl-card" style={{ padding: 8 }}>
          {AREAS.map((a, i) => {
            const who = [directors[0], directors[1], seniorMentors[0], researchTeam[2]][i]
            return (
              <Link key={a.t} to={`/team/${who.slug}`} className="pl-row" style={{ padding: '12px' }}>
                <span className="ti" style={{ flex: '0 0 34%' }}>{a.t}</span>
                <span className="me hide-m" style={{ flex: 1, whiteSpace: 'normal' }}>{a.d}</span>
                <Who m={who} px={26} />
                <span className="me" style={{ width: 70 }}>{who.name.split(' ')[0]}</span>
              </Link>
            )
          })}
        </div>
        <div className="pl-t3" style={{ fontSize: 12, marginTop: 24, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{lab.counts.published} papers</span><span>{lab.active.length} active projects</span><span>{nPeople} people</span><span>{fullName(nick).split(',')[0]} and {nate.name} direct the lab</span>
        </div>
      </div>
    </div>
  )
}

export default function HomeLook({ look }: { look: Look }) {
  return look === 'a' ? <HomeA /> : look === 'b' ? <HomeB /> : look === 'c' ? <HomeC /> : <HomeD />
}
