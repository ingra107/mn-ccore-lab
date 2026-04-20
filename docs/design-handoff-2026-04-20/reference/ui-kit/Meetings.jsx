// Meetings page — upcoming list + detail preview.
const MEETINGS = [
  ['MNCCORE Biweekly · April','Tomorrow · 2:00p','1h',['Nick Ingraham','Emma Bromley','Nate Smith','Paul Lyons','Elliot Loeffler'],'Hub launch demo · sprint review · grants update',true],
  ['Nick ↔ Emma · 1:1','Wed Apr 22 · 3:00p','30m',['Nick Ingraham','Emma Bromley'],'Trainee 6-month plan · proning manuscript',false],
  ['CLIF consortium steering','Thu Apr 23 · 11:00a','1h',['Nick Ingraham','Paul Lyons'],'VACCIA kickoff · ELF v2 vote',false],
  ['Nate R01 writing session','Fri Apr 24 · 10:00a','2h',['Nick Ingraham','Nate Smith'],'Specific aims final pass',false],
  ['Lab all-hands','Mon Apr 27 · 12:00p','45m',['Nick Ingraham','Emma Bromley','Nate Smith','Paul Lyons','Elliot Loeffler','+12'],'Journal club · Q2 roadmap',false],
];

const Meetings = () => (
  <div style={{display:'grid',gridTemplateColumns:'1fr 380px',height:'100%',overflow:'hidden'}}>
    <div style={{overflow:'auto',padding:'20px 24px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',color:'#b0b5b9',opacity:0.85}}>Upcoming · 5</div>
        <Button variant="primary" size="sm"><IconPlus size={13}/>Schedule</Button>
      </div>
      {MEETINGS.map(([t,when,dur,team,summary,next],i)=>(
        <div key={i} style={{padding:'14px 16px',marginBottom:10,background:next?'rgba(201,168,76,0.06)':'#0f1923',
          border:`1px solid ${next?'rgba(201,168,76,0.30)':'rgba(255,255,255,0.08)'}`,borderRadius:8,cursor:'pointer'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
            <span style={{fontWeight:500,color:'#fff',fontSize:14}}>{t}</span>
            {next && <span style={{fontSize:10,color:'#c9a84c',fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase'}}>Next</span>}
          </div>
          <div style={{display:'flex',gap:16,fontSize:12,color:'#b0b5b9',marginBottom:8}}>
            <span>{when}</span><span>·</span><span>{dur}</span>
          </div>
          <div style={{fontSize:12,color:'#e2e8f0',opacity:0.8,marginBottom:10,lineHeight:1.5}}>{summary}</div>
          <AvatarStack names={team.filter(n=>!n.startsWith('+'))} size={22} max={5}/>
        </div>
      ))}
    </div>
    <aside style={{borderLeft:'1px solid rgba(255,255,255,0.06)',background:'#0f1923',padding:'20px 22px',overflow:'auto'}}>
      <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',color:'#c9a84c',marginBottom:6}}>Next · tomorrow</div>
      <h2 style={{fontSize:20,fontWeight:600,color:'#fff',margin:'0 0 4px',letterSpacing:'-0.02em'}}>MNCCORE Biweekly · April</h2>
      <div style={{fontSize:12,color:'#b0b5b9',marginBottom:16}}>Tue Apr 21 · 2:00 – 3:00p · Zoom</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
        <Button variant="primary" size="md"><IconPlus size={13}/>Open meeting doc</Button>
        <Button variant="ghost" size="md">Add agenda item</Button>
      </div>
      <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',color:'#b0b5b9',opacity:0.85,margin:'8px 0 8px'}}>Agenda · 6</div>
      <ol style={{margin:0,paddingLeft:20,fontSize:13,color:'#e2e8f0',lineHeight:1.9}}>
        <li><b style={{fontWeight:500}}>Hub launch demo</b> <span style={{color:'#b0b5b9',opacity:0.7}}>· Nick · 15m</span></li>
        <li>Proning abstract status <span style={{color:'#b0b5b9',opacity:0.7}}>· Emma · 5m</span></li>
        <li>R01 timeline &amp; aims <span style={{color:'#b0b5b9',opacity:0.7}}>· Nate · 10m</span></li>
        <li>FLAME-ICU figure 3 <span style={{color:'#b0b5b9',opacity:0.7}}>· Paul · 5m</span></li>
        <li>Journal club next week <span style={{color:'#b0b5b9',opacity:0.7}}>· Elliot · 5m</span></li>
        <li>Open floor <span style={{color:'#b0b5b9',opacity:0.7}}>· 15m</span></li>
      </ol>
    </aside>
  </div>
);

Object.assign(window, { Meetings });
