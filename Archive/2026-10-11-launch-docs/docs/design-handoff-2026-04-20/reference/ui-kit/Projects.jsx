// Projects list — columnar with progress, grants, domain.
const PROJECTS = [
  ['CLIF: epi of sedation','CLIF','Active',0.72,'Emma Bromley',['Emma Bromley','Paul Lyons','Nick Ingraham'],'R01-HL162442'],
  ['FLAME-ICU · mortality estimator','CLIF','Active',0.55,'Paul Lyons',['Paul Lyons','Nick Ingraham','Elliot Loeffler'],'K23-HL155033'],
  ['Proning incidence · severe ARF','CLIF','In review',0.88,'Emma Bromley',['Emma Bromley','Nick Ingraham'],'—'],
  ['Vent variation · RSI induction','CLIF','Active',0.42,'Elliot Loeffler',['Elliot Loeffler','Nick Ingraham'],'R01-HL162442'],
  ["Nate's IHCA registry",'Cardiac','Active',0.34,'Nate Smith',['Nate Smith','Nick Ingraham'],'K23-HL155033'],
  ['OHCA-RL','Cardiac','Active',0.26,'Nate Smith',['Nate Smith'],'pending'],
  ['Trainee milestones Q2 2026','Mentees','Active',0.68,'Nick Ingraham',['Nick Ingraham','Emma Bromley'],'—'],
  ['CRRT epidemiology','CLIF','Draft',0.14,'Paul Lyons',['Paul Lyons'],'—'],
  ['Sepsis definition comparison','CLIF','Draft',0.08,'Paul Lyons',['Paul Lyons','Nick Ingraham'],'—'],
];

const Projects = () => (
  <div style={{padding:'0',height:'100%',overflow:'auto'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 24px',
      borderBottom:'1px solid rgba(255,255,255,0.06)',background:'#0b1017',position:'sticky',top:0,zIndex:2}}>
      <Button variant="ghost" size="sm"><IconFilter size={13}/>Filter</Button>
      <Button variant="ghost" size="sm">Domain · All</Button>
      <Button variant="ghost" size="sm">Status · Active</Button>
      <span style={{flex:1}}/>
      <Button variant="primary" size="sm"><IconPlus size={13}/>New project</Button>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 100px 110px 1fr 130px 130px 110px',gap:12,
      padding:'10px 24px',position:'sticky',top:49,background:'#0b1017',
      borderBottom:'1px solid rgba(255,255,255,0.06)',zIndex:1,
      fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
      color:'#b0b5b9',opacity:0.85}}>
      <span>Project</span><span>Domain</span><span>Status</span><span>Progress</span><span>Lead</span><span>Team</span><span>Grant</span>
    </div>
    {PROJECTS.map(([title,dom,status,prog,lead,team,grant],i)=>(
      <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 110px 1fr 130px 130px 110px',gap:12,
        padding:'14px 24px',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.03)',
        fontSize:13,color:'#e2e8f0',cursor:'pointer'}}>
        <span style={{fontWeight:500}}>{title}</span>
        <Chip label={dom} tone={dom}/>
        <Chip label={status} tone={status==='Active'?'Active':status==='In review'?'Review':'Draft'}/>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
            <div style={{width:`${prog*100}%`,height:'100%',background:dom==='CLIF'?'#f0737e':dom==='Cardiac'?'#f08a5b':'#c9a84c'}}/>
          </div>
          <span style={{fontSize:11,color:'#b0b5b9',opacity:0.7,width:28,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{Math.round(prog*100)}%</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <Avatar name={lead} size={20}/><span style={{fontSize:12}}>{lead.split(' ')[0]}</span>
        </div>
        <AvatarStack names={team} size={22} max={3}/>
        <span style={{color:grant==='—'?'#b0b5b9':'#c9a84c',opacity:grant==='—'?0.5:1,fontSize:12,fontFamily:'DM Sans',fontVariantNumeric:'tabular-nums'}}>{grant}</span>
      </div>
    ))}
  </div>
);

Object.assign(window, { Projects });
