// Dashboard page — metric cards + heartbeat hero + task snapshot + activity.
const Dashboard = () => (
  <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',gap:24,maxWidth:1280}}>
    {/* Hero */}
    <div style={{padding:'24px 28px',background:'#0f1923',border:'1px solid rgba(255,255,255,0.08)',
      borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:24,overflow:'hidden'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
          color:'#c9a84c',marginBottom:8}}>Monday · Apr 20 · 2026</div>
        <h2 style={{fontSize:28,fontWeight:600,color:'#fff',letterSpacing:'-0.02em',margin:'0 0 6px'}}>Good morning, Nick.</h2>
        <div style={{color:'#b0b5b9',fontSize:14,opacity:0.85}}>
          <b style={{color:'#e2e8f0',fontWeight:500}}>4 tasks due today</b>, biweekly tomorrow, FLAME-ICU abstract lands Friday.
        </div>
      </div>
      <Heartbeat width={280} height={40}/>
    </div>

    {/* Metric strip */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>
      {[
        {label:'Open tasks', val:47, delta:'+3', tone:'#fff'},
        {label:'Active grants', val:3, delta:'$1.4M', tone:'#c9a84c'},
        {label:'Manuscripts in revision', val:12, delta:'2 this wk', tone:'#fff'},
        {label:'Hermes queries · 7d', val:218, delta:'+54', tone:'#5cbcb4'},
      ].map(m => (
        <div key={m.label} style={{padding:16,background:'#0f1923',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8}}>
          <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
            color:'#b0b5b9',opacity:0.85,marginBottom:8}}>{m.label}</div>
          <div style={{display:'flex',alignItems:'baseline',gap:10}}>
            <div style={{fontWeight:700,fontSize:40,lineHeight:1,color:m.tone,fontVariantNumeric:'tabular-nums'}}>{m.val}</div>
            <div style={{fontSize:11,color:'#b0b5b9',opacity:0.7}}>{m.delta}</div>
          </div>
        </div>
      ))}
    </div>

    {/* 2-col: today + activity */}
    <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:16}}>
      <Card title="Due today" count={4} action="View all">
        {[
          ['Draft FLAME-ICU supplementary methods','CLIF','9:30a','Nick Ingraham'],
          ["Review Nate's R01 specific aims",'Cardiac','11:00a','Nick Ingraham'],
          ['Sign off on Emma\'s trainee 6-month plan','Mentees','2:00p','Nick Ingraham'],
          ['Reply to CLIF consortium data pipes thread','CLIF','EOD','Nick Ingraham'],
        ].map(([title,tone,due,who],i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'18px 1fr auto auto',gap:12,padding:'10px 4px',
            borderBottom:i<3?'1px solid rgba(255,255,255,0.04)':'none',alignItems:'center',fontSize:13,color:'#e2e8f0'}}>
            <span style={{width:14,height:14,borderRadius:'50%',border:'1.5px solid #b0b5b9'}}/>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{title}</span>
            <Chip label={tone} tone={tone}/>
            <span style={{color:'#b0b5b9',opacity:0.7,fontSize:12,fontVariantNumeric:'tabular-nums',width:50,textAlign:'right'}}>{due}</span>
          </div>
        ))}
      </Card>

      <Card title="Activity" count={null} action="Filter">
        {[
          ['Emma Bromley','commented on','Proning incidence v3','14m'],
          ['Hermes','summarized','CLIF epi of sedation · weekly','32m'],
          ['Nate Smith','moved','R01 draft → In review','1h'],
          ['You','closed','schema-v46 migration','2h'],
          ['Elliot Loeffler','pushed','vent-variation notebook','3h'],
        ].map(([who,verb,what,when],i)=>(
          <div key={i} style={{display:'flex',gap:10,padding:'10px 4px',alignItems:'flex-start',
            borderBottom:i<4?'1px solid rgba(255,255,255,0.04)':'none',fontSize:12,color:'#e2e8f0'}}>
            <Avatar name={who} size={24}/>
            <div style={{flex:1,minWidth:0,lineHeight:1.4}}>
              <span style={{fontWeight:500}}>{who}</span>
              <span style={{color:'#b0b5b9',opacity:0.7}}> {verb} </span>
              <span>{what}</span>
            </div>
            <span style={{color:'#b0b5b9',opacity:0.5,fontSize:11,fontVariantNumeric:'tabular-nums'}}>{when}</span>
          </div>
        ))}
      </Card>
    </div>
  </div>
);

const Card = ({ title, count, action, children }) => (
  <section style={{background:'#0f1923',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'14px 18px'}}>
    <header style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:6,paddingBottom:8,
      borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:8}}>
        <h3 style={{fontSize:14,fontWeight:500,color:'#fff',margin:0}}>{title}</h3>
        {count != null && <span style={{fontSize:11,color:'#b0b5b9',opacity:0.7,fontVariantNumeric:'tabular-nums'}}>{count}</span>}
      </div>
      {action && <a style={{fontSize:12,color:'#5cbcb4'}}>{action}</a>}
    </header>
    <div>{children}</div>
  </section>
);

Object.assign(window, { Dashboard, Card });
