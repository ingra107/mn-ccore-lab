// Hub shell: sidebar + topbar + main scroll area.
const NAV = [
  { group: 'Work', items: [
    { id:'dashboard', label:'Dashboard', icon: IconHome },
    { id:'mine',      label:'My items',  icon: IconList, count: 12 },
    { id:'tasks',     label:'Tasks',     icon: IconList, count: 47 },
    { id:'meetings',  label:'Meetings',  icon: IconCal },
  ]},
  { group: 'Research', items: [
    { id:'projects',  label:'Projects',  icon: IconFolder, count: 14 },
    { id:'grants',    label:'Grants',    icon: IconAward, count: 3 },
    { id:'digest',    label:'Research digest', icon: IconBook },
    { id:'hermes',    label:'Hermes',    icon: IconSparkle },
  ]},
  { group: 'Lab', items: [
    { id:'team',      label:'Team',      icon: IconUsers },
  ]},
];

const SideBar = ({ current, onNav }) => (
  <aside style={{width:240,flexShrink:0,background:'#0a0f15',borderRight:'1px solid rgba(255,255,255,0.06)',
    display:'flex',flexDirection:'column',padding:'14px 10px',gap:16,height:'100%',overflowY:'auto'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 6px 8px'}}>
      <Wordmark height={20}/>
      <span style={{color:'#b0b5b9',opacity:0.6}}><IconBell size={14}/></span>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'rgba(255,255,255,0.03)',
      border:'1px solid rgba(255,255,255,0.06)',borderRadius:6,color:'#b0b5b9',fontSize:12}}>
      <IconSearch size={13}/><span style={{flex:1,opacity:0.7}}>Search…</span><Kbd>⌘K</Kbd>
    </div>
    {NAV.map(g => (
      <div key={g.group} style={{display:'flex',flexDirection:'column',gap:2}}>
        <div style={{padding:'4px 8px',fontSize:10,fontWeight:500,letterSpacing:'0.08em',
          textTransform:'uppercase',color:'#b0b5b9',opacity:0.85}}>{g.group}</div>
        {g.items.map(it => {
          const active = current === it.id;
          const Ic = it.icon;
          return (
            <button key={it.id} onClick={()=>onNav(it.id)}
              style={{display:'flex',alignItems:'center',gap:10,padding:'7px 8px',borderRadius:6,
                background: active ? 'rgba(201,168,76,0.10)' : 'transparent',
                color: active ? '#c9a84c' : '#e2e8f0',
                border:'none',fontFamily:'inherit',fontSize:13,fontWeight: active?500:400,
                cursor:'pointer',textAlign:'left',width:'100%'}}>
              <Ic size={14}/>
              <span style={{flex:1}}>{it.label}</span>
              {it.count != null && (
                <span style={{fontSize:11,color:'#b0b5b9',opacity:0.7,fontVariantNumeric:'tabular-nums'}}>{it.count}</span>
              )}
            </button>
          );
        })}
      </div>
    ))}
    <div style={{marginTop:'auto',padding:'10px 8px',display:'flex',alignItems:'center',gap:10,
      borderTop:'1px solid rgba(255,255,255,0.06)'}}>
      <Avatar name="Nick Ingraham" size={28}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:'#e2e8f0'}}>Nick Ingraham</div>
        <div style={{fontSize:11,color:'#b0b5b9',opacity:0.7}}>PI · ingra107@umn.edu</div>
      </div>
    </div>
  </aside>
);

const TopBar = ({ title, breadcrumbs = [], actions = null }) => (
  <header style={{height:56,flexShrink:0,display:'flex',alignItems:'center',padding:'0 24px',
    borderBottom:'1px solid rgba(255,255,255,0.06)',background:'#0f1923',gap:16}}>
    <div style={{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:0}}>
      {breadcrumbs.map((c,i)=>(
        <React.Fragment key={i}>
          <span style={{color:'#b0b5b9',opacity:0.6,fontSize:13}}>{c}</span>
          <span style={{color:'#b0b5b9',opacity:0.3}}>/</span>
        </React.Fragment>
      ))}
      <h1 style={{fontSize:16,fontWeight:500,color:'#fff',letterSpacing:'-0.01em',margin:0}}>{title}</h1>
    </div>
    {actions}
  </header>
);

Object.assign(window, { SideBar, TopBar, NAV });
