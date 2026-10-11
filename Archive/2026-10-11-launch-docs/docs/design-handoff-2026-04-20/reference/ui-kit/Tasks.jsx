// Tasks page — dense columnar table with inline-edit affordances.
const { useState: useState_T } = React;
const TASKS = [
  ['Draft FLAME-ICU supplementary methods','CLIF','P1','In progress','Apr 23','Nick Ingraham'],
  ["Review Nate's R01 specific aims",'Cardiac','P0','In progress','Apr 25','Nick Ingraham'],
  ['Sign off on Emma\'s 6-month plan','Mentees','P2','Todo','Apr 21','Nick Ingraham'],
  ['Close schema-v46 migration','CLIF','P1','Done','Apr 20','Nick Ingraham'],
  ['Reply to CLIF data-pipes thread','CLIF','P2','Todo','Apr 20','Nick Ingraham'],
  ['Vent variation figures v4','Cardiac','P1','In review','Apr 28','Elliot Loeffler'],
  ['Proning incidence · severe ARF abstract','CLIF','P0','In review','Apr 22','Emma Bromley'],
  ['Sepsis definition comparison table','CLIF','P2','Todo','May 02','Paul Lyons'],
  ['OHCA-RL: reward shaping ablation','Cardiac','P1','In progress','May 06','Nate Smith'],
  ['CRRT epidemiology figure polishing','CLIF','P2','Todo','May 09','Paul Lyons'],
  ['Trainee milestone: Q2 check-in','Mentees','P1','Todo','Apr 30','Nick Ingraham'],
  ['Clif-pf-sf → pf-v-sf-oxygenation merge','CLIF','P1','Done','Apr 19','Nick Ingraham'],
];

const STATUS = {
  'Todo':{fg:'#b0b5b9',bg:'rgba(255,255,255,0.06)'},
  'In progress':{fg:'#c9a84c',bg:'rgba(201,168,76,0.12)'},
  'In review':{fg:'#5cbcb4',bg:'rgba(92,188,180,0.10)'},
  'Done':{fg:'#6ee89a',bg:'rgba(110,232,154,0.12)'},
};
const PRI = { 'P0':'#f0737e','P1':'#c9a84c','P2':'#b0b5b9' };

const Tasks = () => {
  const [sel, setSel] = useState_T(1);
  return (
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 24px',
          borderBottom:'1px solid rgba(255,255,255,0.06)',background:'#0b1017'}}>
          <Button variant="ghost" size="sm"><IconFilter size={13}/>Filter</Button>
          <Button variant="ghost" size="sm">Sort · Due</Button>
          <Button variant="ghost" size="sm">Group · Project</Button>
          <span style={{flex:1}}/>
          <span style={{fontSize:11,color:'#b0b5b9',opacity:0.7}}>Press <Kbd>F</Kbd> to filter</span>
          <Button variant="primary" size="sm"><IconPlus size={13}/>Add task</Button>
        </div>

        <div style={{flex:1,overflow:'auto'}}>
          <div style={{display:'grid',gridTemplateColumns:'24px 30px 1fr 110px 60px 110px 100px 130px',gap:12,
            padding:'8px 24px',position:'sticky',top:0,background:'#0b1017',
            borderBottom:'1px solid rgba(255,255,255,0.08)',zIndex:1,
            fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
            color:'#b0b5b9',opacity:0.85}}>
            <span></span><span></span><span>Task</span><span>Project</span><span>Pri</span><span>Status</span><span>Due</span><span>Assignee</span>
          </div>
          {TASKS.map(([t,proj,pri,status,due,who],i)=>{
            const active = i===sel;
            const st = STATUS[status];
            return (
              <div key={i} onClick={()=>setSel(i)}
                style={{display:'grid',gridTemplateColumns:'24px 30px 1fr 110px 60px 110px 100px 130px',gap:12,
                  padding:'11px 24px',alignItems:'center',cursor:'pointer',
                  background: active ? 'rgba(92,188,180,0.08)' : 'transparent',
                  borderLeft: active ? '2px solid #5cbcb4' : '2px solid transparent',
                  borderBottom:'1px solid rgba(255,255,255,0.03)',fontSize:13,color:'#e2e8f0'}}>
                <span style={{color:'#b0b5b9',opacity:0.5,fontSize:11}}>{i+1}</span>
                <span style={{width:14,height:14,borderRadius:'50%',
                  border: status==='Done'?'none':'1.5px solid #b0b5b9',
                  background: status==='Done'?'#6ee89a':'transparent'}}/>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  textDecoration: status==='Done'?'line-through':'none',
                  opacity: status==='Done'?0.55:1}}>{t}</span>
                <Chip label={proj} tone={proj}/>
                <span style={{color:PRI[pri],fontSize:12,fontWeight:500}}>{pri}</span>
                <span style={{display:'inline-flex',alignItems:'center',height:22,padding:'0 10px',
                  background:st.bg,color:st.fg,borderRadius:9999,fontSize:11,fontWeight:500}}>{status}</span>
                <span style={{color:'#b0b5b9',opacity:0.75,fontSize:12,fontVariantNumeric:'tabular-nums'}}>{due}</span>
                <div style={{display:'flex',gap:6,alignItems:'center',minWidth:0}}>
                  <Avatar name={who} size={20}/>
                  <span style={{fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{who.split(' ')[0]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <aside style={{width:340,flexShrink:0,borderLeft:'1px solid rgba(255,255,255,0.06)',
        background:'#0f1923',padding:'20px 22px',overflowY:'auto'}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
          color:'#b0b5b9',opacity:0.85,marginBottom:6}}>Task · #{sel+1}</div>
        <h2 style={{fontSize:18,fontWeight:600,color:'#fff',margin:'0 0 14px',lineHeight:1.35}}>{TASKS[sel][0]}</h2>
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:'10px 14px',fontSize:12,marginBottom:18}}>
          <span style={{color:'#b0b5b9',opacity:0.7}}>Project</span>
          <div><Chip label={TASKS[sel][1]} tone={TASKS[sel][1]}/></div>
          <span style={{color:'#b0b5b9',opacity:0.7}}>Status</span>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',color:STATUS[TASKS[sel][3]].fg}}>
            <span style={{fontWeight:500}}>{TASKS[sel][3]}</span>
            <span style={{opacity:0.6}}>▾</span>
          </div>
          <span style={{color:'#b0b5b9',opacity:0.7}}>Priority</span>
          <div style={{display:'flex',justifyContent:'space-between',color:PRI[TASKS[sel][2]]}}>
            <span style={{fontWeight:500}}>{TASKS[sel][2]}</span><span style={{opacity:0.6}}>▾</span>
          </div>
          <span style={{color:'#b0b5b9',opacity:0.7}}>Due</span>
          <div style={{color:'#e2e8f0',fontVariantNumeric:'tabular-nums'}}>{TASKS[sel][4]}, 2026</div>
          <span style={{color:'#b0b5b9',opacity:0.7}}>Assignee</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}><Avatar name={TASKS[sel][5]} size={20}/><span>{TASKS[sel][5]}</span></div>
        </div>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
          color:'#b0b5b9',opacity:0.85,margin:'4px 0 8px'}}>Description</div>
        <div style={{fontSize:13,color:'#e2e8f0',opacity:0.85,lineHeight:1.55,marginBottom:18}}>
          Pull the updated cohort (n=14,302) and regenerate figures 2 &amp; 3. Flag patients with PF/SF gap &gt;40 for manual review before committing.
        </div>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',
          color:'#b0b5b9',opacity:0.85,margin:'4px 0 8px'}}>Comments · 3</div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[
            ['Emma Bromley','Bumping to P0 — abstract deadline is Friday.','14m'],
            ['Hermes','Summary: recent commits touched `figures/fig2.R` — re-run with `--cohort v4`.','32m'],
            ['You','Linked to CLIF-epi-of-sedation repo.','2h'],
          ].map(([who,txt,when],i)=>(
            <div key={i} style={{display:'flex',gap:10}}>
              {who==='Hermes'
                ? <div style={{width:24,height:24,borderRadius:'50%',background:'rgba(201,168,76,0.15)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <IconSparkle size={13} stroke={2}/>
                  </div>
                : <Avatar name={who} size={24}/>}
              <div style={{flex:1,fontSize:12,lineHeight:1.5}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}}>
                  <span style={{fontWeight:500,color: who==='Hermes' ? '#c9a84c' : '#e2e8f0'}}>{who}</span>
                  <span style={{color:'#b0b5b9',opacity:0.5,fontSize:11}}>{when}</span>
                </div>
                <div style={{color:'#e2e8f0',opacity:0.85}}>{txt}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

Object.assign(window, { Tasks });
