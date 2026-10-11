// Shared components for the MN-CCORE Hub UI kit.
// Exposes components globally via window assignment (no module scope).

const { useState } = React;

// ── Icons (Lucide-style inline SVG) ──────────────────────────────────
const Icon = ({ d, size = 16, stroke = 1.75, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children || <path d={d}/>}
  </svg>
);
const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></Icon>;
const IconHome = (p) => <Icon {...p}><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></Icon>;
const IconList = (p) => <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Icon>;
const IconFolder = (p) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Icon>;
const IconCal = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>;
const IconUsers = (p) => <Icon {...p}><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.7"/></Icon>;
const IconBook = (p) => <Icon {...p}><path d="M4 4h13a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3z"/><path d="M4 4v14"/></Icon>;
const IconAward = (p) => <Icon {...p}><circle cx="12" cy="9" r="6"/><path d="m9 14-2 8 5-3 5 3-2-8"/></Icon>;
const IconSparkle = (p) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2"/></Icon>;
const IconChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>;
const IconPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const IconFilter = (p) => <Icon {...p}><path d="M3 5h18M6 12h12M10 19h4"/></Icon>;
const IconSend = (p) => <Icon {...p}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></Icon>;
const IconBell = (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>;

// ── Heartbeat line ────────────────────────────────────────────────────
const HEARTBEAT_PATH = "M0 32 L100 32 L118 32 Q128 25 138 32 L158 32 L162 34 L166 6 L170 58 L174 28 L178 32 L225 32 L240 26 L255 23 L270 26 L285 32 L320 32 L420 32 L438 32 Q448 25 458 32 L478 32 L482 34 L486 6 L490 58 L494 28 L498 32 L545 32 L560 26 L575 23 L590 26 L605 32 L640 32";
const Heartbeat = ({ width = 320, height = 32, animate = true, opacity = 1 }) => (
  <svg viewBox="0 0 640 64" width={width} height={height} style={{overflow:'visible',opacity}}>
    <defs><filter id={`hb-glow-${width}`}><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <path d={HEARTBEAT_PATH} stroke="#c9a84c" strokeWidth="2" fill="none" opacity="0.18"/>
    <path d={HEARTBEAT_PATH} stroke="#c9a84c" strokeWidth="2" fill="none" filter={`url(#hb-glow-${width})`} opacity="0.55"/>
    <path d={HEARTBEAT_PATH} stroke="#c9a84c" strokeWidth="2" fill="none" strokeDasharray="1320" strokeDashoffset={animate ? undefined : 0}>
      {animate && <animate attributeName="stroke-dashoffset" values="1320;0;0" dur="2s" repeatCount="indefinite"/>}
    </path>
  </svg>
);

// ── Wordmark ──────────────────────────────────────────────────────────
const Wordmark = ({ height = 28 }) => (
  <div style={{display:'flex',alignItems:'center',gap:2,height,color:'#fff',fontFamily:'Fraunces, Georgia, serif',fontWeight:700,fontSize:height*0.85,letterSpacing:'-0.02em',lineHeight:1}}>
    <span>MN</span>
    <svg viewBox="0 0 80 40" width={height*1.4} height={height} style={{marginTop:-2}}>
      <path d="M4 20 L18 20 L23 10 L28 32 L33 14 L38 26 L43 20 L76 20"
            stroke="#c9a84c" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span>CCORE</span>
  </div>
);

// ── Avatar ────────────────────────────────────────────────────────────
const COLORS = ['#c9a84c','#5cbcb4','#f0737e','#f08a5b','#6ee89a'];
const hashIdx = (s) => { let h=0; for (const c of s||'?') h=(h*31+c.charCodeAt(0))|0; return Math.abs(h)%COLORS.length; };
const Avatar = ({ name = '??', size = 24, ring = false }) => {
  const initials = name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:'#1a2939',color:COLORS[hashIdx(name)],
      display:'flex',alignItems:'center',justifyContent:'center',
      fontSize:size*0.38,fontWeight:500,flexShrink:0,
      border: ring ? '2px solid #0b1017' : 'none'}}>{initials}</div>
  );
};
const AvatarStack = ({ names, max = 4, size = 24 }) => (
  <div style={{display:'flex'}}>
    {names.slice(0,max).map((n,i)=>(
      <div key={i} style={{marginLeft:i?-size*0.3:0}}><Avatar name={n} size={size} ring/></div>
    ))}
    {names.length > max && (
      <div style={{marginLeft:-size*0.3,width:size,height:size,borderRadius:'50%',background:'#14202c',
        color:'#b0b5b9',border:'2px solid #0b1017',display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:size*0.36,fontWeight:500}}>+{names.length-max}</div>
    )}
  </div>
);

// ── Badge / chip ──────────────────────────────────────────────────────
const DOMAINS = {
  CLIF:    { fg:'#f0737e', bg:'rgba(240,115,126,0.12)' },
  Cardiac: { fg:'#f08a5b', bg:'rgba(240,138,91,0.12)' },
  Mentees: { fg:'#5cbcb4', bg:'rgba(92,188,180,0.10)' },
  Grant:   { fg:'#c9a84c', bg:'rgba(201,168,76,0.15)' },
  Done:    { fg:'#6ee89a', bg:'rgba(110,232,154,0.12)' },
  Active:  { fg:'#c9a84c', bg:'rgba(201,168,76,0.15)' },
  Draft:   { fg:'#b0b5b9', bg:'rgba(255,255,255,0.06)' },
  Review:  { fg:'#5cbcb4', bg:'rgba(92,188,180,0.10)' },
};
const Chip = ({ label, tone }) => {
  const t = DOMAINS[tone] || DOMAINS.Draft;
  return <span style={{display:'inline-flex',alignItems:'center',height:22,padding:'0 10px',
    background:t.bg,color:t.fg,borderRadius:9999,fontSize:11,fontWeight:500,whiteSpace:'nowrap'}}>{label}</span>;
};

// ── Button ────────────────────────────────────────────────────────────
const Button = ({ variant = 'primary', size = 'md', children, onClick, style = {} }) => {
  const h = size === 'sm' ? 28 : 36;
  const fs = size === 'sm' ? 12 : 13;
  const variants = {
    primary: { bg:'#c9a84c', fg:'#1a1a1a', border:'none' },
    teal:    { bg:'#0d6f68', fg:'#fff',    border:'none' },
    ghost:   { bg:'transparent', fg:'#e2e8f0', border:'1px solid rgba(255,255,255,0.18)' },
    link:    { bg:'transparent', fg:'#5cbcb4', border:'none' },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} style={{height:h,padding:`0 ${size==='sm'?10:14}px`,background:v.bg,color:v.fg,
      border:v.border,borderRadius:6,fontFamily:'inherit',fontSize:fs,fontWeight:500,cursor:'pointer',
      display:'inline-flex',alignItems:'center',gap:6,...style}}>{children}</button>
  );
};

// ── Kbd ───────────────────────────────────────────────────────────────
const Kbd = ({ children }) => (
  <kbd style={{fontFamily:"'JetBrains Mono', monospace",fontSize:11,fontWeight:500,padding:'2px 6px',
    border:'1px solid rgba(255,255,255,0.10)',borderRadius:4,background:'#14202c',color:'#e2e8f0',
    letterSpacing:'0.06em',textTransform:'uppercase'}}>{children}</kbd>
);

Object.assign(window, {
  Icon, IconSearch, IconHome, IconList, IconFolder, IconCal, IconUsers, IconBook, IconAward,
  IconSparkle, IconChevronDown, IconPlus, IconFilter, IconSend, IconBell,
  Heartbeat, Wordmark, Avatar, AvatarStack, Chip, Button, Kbd, DOMAINS, HEARTBEAT_PATH,
});
