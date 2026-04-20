// Hermes — AI research assistant panel.
const { useState: useSH } = React;
const Hermes = () => {
  const [q,setQ] = useSH('');
  return (
    <div style={{display:'grid',gridTemplateColumns:'260px 1fr',height:'100%',overflow:'hidden'}}>
      <aside style={{borderRight:'1px solid rgba(255,255,255,0.06)',background:'#0a0f15',padding:'16px 12px',overflow:'auto'}}>
        <div style={{fontSize:10,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase',color:'#b0b5b9',opacity:0.85,marginBottom:10}}>Recent</div>
        {['Summarize CLIF epi of sedation','Compare proning incidence 2022 vs 2024','Draft R01 aim 2','Pull FLAME-ICU cohort stats','@mentions this week'].map((t,i)=>(
          <div key={i} style={{padding:'8px 8px',borderRadius:6,background:i===0?'rgba(201,168,76,0.10)':'transparent',color:i===0?'#c9a84c':'#e2e8f0',fontSize:12,cursor:'pointer',marginBottom:2}}>{t}</div>
        ))}
      </aside>
      <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{flex:1,overflow:'auto',padding:'24px 32px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(201,168,76,0.15)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <IconSparkle size={17} stroke={2}/>
            </div>
            <div>
              <div style={{fontWeight:600,color:'#fff',fontSize:15}}>Hermes</div>
              <div style={{fontSize:11,color:'#b0b5b9',opacity:0.7}}>Research assistant · grounded in lab knowledge</div>
            </div>
          </div>
          <div style={{display:'flex',gap:12,marginBottom:16}}>
            <Avatar name="Nick" size={24}/>
            <div style={{background:'#14202c',padding:'10px 14px',borderRadius:8,fontSize:13,color:'#e2e8f0',maxWidth:520}}>Summarize CLIF epi of sedation — where are we on figures for the abstract?</div>
          </div>
          <div style={{display:'flex',gap:12,marginBottom:16}}>
            <div style={{width:24,height:24,borderRadius:'50%',background:'rgba(201,168,76,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <IconSparkle size={13} stroke={2}/>
            </div>
            <div style={{background:'rgba(201,168,76,0.05)',border:'1px solid rgba(201,168,76,0.20)',padding:'12px 16px',borderRadius:8,fontSize:13,color:'#e2e8f0',maxWidth:640,lineHeight:1.6}}>
              <div style={{marginBottom:10}}>Here's the state of <b style={{color:'#c9a84c',fontWeight:500}}>CLIF: epi of sedation</b> (as of 2h ago):</div>
              <ul style={{margin:'0 0 10px',paddingLeft:18}}>
                <li>Cohort v4 finalized · <b style={{color:'#fff',fontWeight:500}}>n = 14,302</b> across 9 centers</li>
                <li>Figures 1 &amp; 2 committed · Figure 3 is the open item (Emma, due Fri)</li>
                <li>3 open tasks · 2 P1, 1 P0</li>
              </ul>
              <div style={{color:'#b0b5b9',fontSize:11}}>Sources · <a style={{color:'#5cbcb4'}}>CLIF-epi-of-sedation</a> · <a style={{color:'#5cbcb4'}}>task #47</a> · <a style={{color:'#5cbcb4'}}>meeting 2026-04-07</a></div>
            </div>
          </div>
        </div>
        <div style={{padding:'12px 24px 20px',borderTop:'1px solid rgba(255,255,255,0.06)',background:'#0b1017'}}>
          <div style={{display:'flex',gap:10,alignItems:'center',background:'#14202c',border:'1px solid rgba(255,255,255,0.10)',borderRadius:10,padding:'8px 12px'}}>
            <IconSparkle size={15}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask Hermes about a project, task, or manuscript…"
              style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#e2e8f0',fontSize:13,fontFamily:'inherit'}}/>
            <Kbd>⏎</Kbd>
            <Button variant="primary" size="sm"><IconSend size={13}/>Send</Button>
          </div>
          <div style={{fontSize:11,color:'#b0b5b9',opacity:0.6,marginTop:8}}>Tip: type <Kbd>@hermes</Kbd> in any task comment to invoke inline.</div>
        </div>
      </div>
    </div>
  );
};
Object.assign(window, { Hermes });
