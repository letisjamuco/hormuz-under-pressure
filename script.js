const DATA={
  hormuz:'data/processed/hormuz_daily.csv',
  summary:'data/processed/chokepoints_summary.csv',
  chDaily:'data/processed/chokepoints_daily.csv',
  ba:'data/processed/hormuz_before_after.csv',
  events:'data/processed/hormuz_events.csv',
  market:'data/processed/market_prices.csv',
  greekNat:'data/processed/greece_fuel_national.csv',
  greekA95:'data/processed/greece_a95_by_nomos.csv',
  greekDiesel:'data/processed/greece_diesel_by_nomos.csv',
  greekA100:'data/processed/greece_a100_by_nomos.csv',
  greekHeating:'data/processed/greece_heating_by_nomos.csv',
  greekLPG:'data/processed/greece_lpg_by_nomos.csv',
  origins:'data/processed/hormuz_origin_flows.csv',
  destinations:'data/processed/hormuz_destination_flows.csv',
  priceParts:'data/processed/fuel_price_decomposition.csv'
};
const TPERIODS={'2026 Jan-May':['2026-01-01','2026-05-17'],'Full record':['2019-01-01','2026-05-17']};
const fmt={
  date:d3.timeFormat('%d %b %Y'),
  dS:d3.timeFormat('%b %Y'),
  shortDate:d3.timeFormat('%d %b'),
  num:d3.format(',.0f'),
  one:d3.format(',.1f'),
  two:d3.format(',.2f'),
  mbd:d=>`${d3.format(',.1f')(d)}M b/d`,
  eur:d=>`€${d3.format(',.3f')(d)}`,
  usd:d=>`$${d3.format(',.0f')(d)}`,
  pct:d3.format('.0%'),
  sp:d=>`${d>=0?'+':'−'}${d3.format('.0%')(Math.abs(d))}`,
  si:d3.format(',.2s')
};
const pd=d3.timeParse('%Y-%m-%d');
const tip=d3.select('#tooltip');
const C={sea:'#0f4d46',sea2:'#74b8a7',orange:'#d36a38',oil:'#1a1a16',soft:'#6d8e86',gold:'#f5c542'};
const st={tPeriod:'2026 Jan-May',rkMetric:'avg_tanker',rkPeriod:'Before HORMUZ-26',selectedChokepoint:null,grFuel:'a95',nomosFuel:'a95',nomosMode:'price',nomos:null,nomosQuery:'',nomosAdded:null};
const FUEL_LABELS={a95:'A95',a100:'A100',diesel_kinisis:'Diesel',diesel_thermansis:'Heating diesel',lpg:'LPG'};
const NOMOS_FUELS=[
  ['A95','a95','ga'],
  ['A100','a100','ga100'],
  ['Diesel','diesel_kinisis','gd'],
  ['Heating diesel','diesel_thermansis','gh'],
  ['LPG','lpg','glpg']
];
function nomosDataset(D){return ({a95:D.ga,a100:D.ga100,diesel_kinisis:D.gd,diesel_thermansis:D.gh,lpg:D.glpg})[st.nomosFuel]||D.ga;}


Promise.all([
  d3.csv(DATA.hormuz,rH),
  d3.csv(DATA.summary,rS),
  d3.csv(DATA.chDaily,rH),
  d3.csv(DATA.ba,rBA),
  d3.csv(DATA.events,rE),
  d3.csv(DATA.market,rM),
  d3.csv(DATA.greekNat),
  d3.csv(DATA.greekA95),
  d3.csv(DATA.greekDiesel),
  d3.csv(DATA.greekA100),
  d3.csv(DATA.greekHeating),
  d3.csv(DATA.greekLPG),
  d3.csv(DATA.origins,rFlow),
  d3.csv(DATA.destinations,rFlow),
  d3.csv(DATA.priceParts,rParts)
]).then(([hz,su,chDaily,ba,ev,mk,gn,ga,gd,ga100,gh,glpg,origins,destinations,parts])=>{
  const D={hz,su,chDaily,ba,ev,mk,gn,ga,gd,ga100,gh,glpg,origins,destinations,parts}; window.__DATA__=D;
  initProgress(); initControls(D); initMapButtons(); renderAll(D); fillHero(ba,mk);
  window.addEventListener('resize',debounce(()=>renderAll(D),200));
  window.addEventListener('message',e=>{
    if(e.data?.type==='chokepoint-click') {
      st.selectedChokepoint=e.data.portid;
      renderRank(D);
    }
    if(e.data?.type==='nomos-click') highlightNomos(e.data.nomos,false);
  });
});

function rH(d){const o={...d,date:pd(d.date)};['n_total','n_tanker','n_cargo','n_container','n_dry_bulk','n_general_cargo','n_roro','capacity','capacity_tanker','n_total_ma7','n_tanker_ma7','capacity_ma7','capacity_tanker_ma7'].forEach(k=>o[k]=+d[k]||0);return o;}
function rS(d){const o={...d};['days','avg_total','avg_tanker','avg_cargo','avg_capacity','avg_tanker_capacity','total_total','total_tanker','total_capacity','tanker_share'].forEach(k=>o[k]=+d[k]||0);return o;}
function rBA(d){const o={...d};['days','avg_total_transits_per_day','avg_tankers_per_day','avg_capacity_per_day','avg_tanker_capacity_per_day'].forEach(k=>o[k]=+d[k]||0);return o;}
function rE(d){return{...d,fromdate_parsed:pd((d.fromdate_parsed||'').slice(0,10))};}
function rM(d){return{date:pd(d.date),brent:+d.brent_usd_per_barrel||null,jet:+d.jet_fuel_usd_per_gallon||null,jetBbl:+d.jet_fuel_usd_per_barrel_equiv||null};}
function rFlow(d){return{...d,lat:+d.lat,lon:+d.lon,mbd_2024:+d.mbd_2024,share_2024:+d.share_2024||null,is_aggregate:d.is_aggregate==='yes'};}
function rParts(d){const o={date:pd(d.date)};['a95_retail','a95_refinery','a95_taxes','a95_margin','diesel_retail','diesel_refinery','diesel_taxes','diesel_margin'].forEach(k=>o[k]=+d[k]||null);return o;}

function initControls(D){
  pills('#traffic-periods',Object.keys(TPERIODS),st.tPeriod,v=>{st.tPeriod=v;renderAll(D);});
  pills('#rank-period-pills',['Before','After'],st.rkPeriod==='Before HORMUZ-26'?'Before':'After',v=>{
    st.rkPeriod=(v==='Before'?'Before HORMUZ-26':'After HORMUZ-26');
    renderRank(D);
    const iframe=document.getElementById('world-map-iframe');
    if(iframe) iframe.contentWindow.postMessage({type:'period-change',period:st.rkPeriod},'*');
  });
  pills('#rank-metric-pills',['Tankers/day','Tanker %'],st.rkMetric==='avg_tanker'?'Tankers/day':'Tanker %',v=>{
    st.rkMetric=(v==='Tankers/day'?'avg_tanker':'tanker_share');
    renderRank(D);
    const iframe=document.getElementById('world-map-iframe');
    if(iframe) iframe.contentWindow.postMessage({type:'metric-change',metric:st.rkMetric},'*');
  });
  pills('#greece-fuel-pills',['A95','A100','Diesel','Heating diesel','LPG'],FUEL_LABELS[st.grFuel],v=>{st.grFuel={A95:'a95',A100:'a100',Diesel:'diesel_kinisis','Heating diesel':'diesel_thermansis',LPG:'lpg'}[v];renderAll(D);});
  pills('#nomos-mode-pills',['Latest price','Change since HORMUZ-26'],st.nomosMode==='price'?'Latest price':'Change since HORMUZ-26',v=>{
    st.nomosMode=(v==='Latest price'?'price':'change');
    renderNomos(nomosDataset(D));
    const iframe=document.getElementById('greece-map-iframe');
    if(iframe) iframe.contentWindow.postMessage({type:'mode-change',mode:st.nomosMode},'*');
  });
  pills('#nomos-fuel-pills',NOMOS_FUELS.map(d=>d[0]),FUEL_LABELS[st.nomosFuel],v=>{
    st.nomosFuel=({A95:'a95',A100:'a100',Diesel:'diesel_kinisis','Heating diesel':'diesel_thermansis',LPG:'lpg'})[v];
    renderNomos(nomosDataset(D));
    const iframe=document.getElementById('greece-map-iframe');
    if(iframe) iframe.contentWindow.postMessage({type:'fuel-change',fuel:st.nomosFuel},'*');
  });
  const clearRank=d3.select('#rank-clear-selection');
  if(!clearRank.empty()) clearRank.on('click',()=>{
    st.selectedChokepoint=null;
    renderRank(D);
    const iframe=document.getElementById('world-map-iframe');
    if(iframe) iframe.contentWindow.postMessage({type:'reset-highlight'},'*');
  });
  const ns=d3.select('#nomos-search');
  if(!ns.empty()) ns.on('input',ev=>{st.nomosQuery=(ev.target.value||'').trim();renderNomos(nomosDataset(D));});
}
let rerender=()=>{};
function renderAll(D){
  rerender=()=>renderAll(D);
  renderRank(D);
  renderMixArea(D.hz);
  renderMix(D.hz);
  renderFlowBars(D.origins,D.destinations);
  renderPrices(D.mk);
  renderGreece(D.gn);
  renderNomos(nomosDataset(D));
}

function pills(s,v,a,cb){d3.select(s).selectAll('button').data(v).join('button').attr('type','button').attr('class',d=>d===a?'is-active':null).text(d=>d).on('click',(_,d)=>cb(d));}
function upP(s,a){d3.select(s).selectAll('button').attr('class',d=>d===a?'is-active':null);}
function fP(d,l){const[s,e]=TPERIODS[l].map(pd);return d.filter(r=>r.date>=s&&r.date<=e);}
function chokepointPeriodData(rows,period){
  const start=period==='Before HORMUZ-26'?pd('2026-01-01'):pd('2026-03-01');
  const end=period==='Before HORMUZ-26'?pd('2026-02-28'):pd('2026-05-17');
  const filtered=rows.filter(d=>d.date>=start&&d.date<=end);
  const groups=d3.groups(filtered,d=>d.portid,d=>d.portname);
  return groups.map(([portid, byName])=>{
    const portname=byName[0][0];
    const arr=byName.flatMap(d=>d[1]);
    const avg_total=d3.mean(arr,d=>d.n_total)||0;
    const avg_tanker=d3.mean(arr,d=>d.n_tanker)||0;
    const avg_capacity=d3.mean(arr,d=>d.capacity)||0;
    const tanker_share=avg_total?avg_tanker/avg_total:0;
    return {portid,portname,avg_total,avg_tanker,avg_capacity,tanker_share,period};
  });
}
function cS(svg,h=300){const n=svg.node(),w=n.clientWidth||680;svg.attr('viewBox',`0 0 ${w} ${h}`);svg.selectAll('*').remove();return{W:w,H:h};}
function showT(ev,h){tip.html(h).style('opacity',1).style('left',`${Math.min(ev.clientX+12,innerWidth-260)}px`).style('top',`${ev.clientY+12}px`);}
function hideT(){tip.style('opacity',0);}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
function addEv(svg,x,y1,y2,l){svg.append('line').attr('class','event-line').attr('x1',x).attr('x2',x).attr('y1',y1).attr('y2',y2);svg.append('text').attr('x',x+4).attr('y',y1+9).attr('fill',C.orange).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).text(l);}
function addL(svg,x,y,items,opts={}){const gapX=opts.gapX||105,gapY=opts.gapY||16,vertical=!!opts.vertical;const g=svg.append('g').attr('transform',`translate(${x},${y})`);items.forEach((it,i)=>{const tx=vertical?0:i*gapX,ty=vertical?i*gapY:0;const gg=g.append('g').attr('transform',`translate(${tx},${ty})`);gg.append('rect').attr('width',18).attr('height',6).attr('rx',3).attr('fill',it[1]);gg.append('text').attr('x',22).attr('y',6).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.soft).text(it[0]);});}
function addH(svg,data,x,m,h,fn){const bi=d3.bisector(d=>d.date).center;const fo=svg.append('g').style('display','none');fo.append('line').attr('y1',m.top).attr('y2',h-m.bottom).attr('stroke','rgba(14,74,66,.18)').attr('stroke-dasharray','3 4');svg.append('rect').attr('fill','transparent').attr('x',m.left).attr('y',m.top).attr('width',x.range()[1]-m.left).attr('height',h-m.top-m.bottom).on('mousemove',ev=>{const d=data[bi(data,x.invert(d3.pointer(ev)[0]))];if(!d)return;fo.style('display',null).attr('transform',`translate(${x(d.date)},0)`);showT(ev,fn(d));}).on('mouseleave',()=>{fo.style('display','none');hideT();});}
function normNomos(n){return (n||'').replace(/^ΝΟΜΟΣ\s+/,'').trim();}
function initMapButtons(){
  document.querySelectorAll('.map-card').forEach(card=>{
    if(card.querySelector('.map-fullscreen-btn')) return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='map-fullscreen-btn';
    btn.textContent='Full screen';
    btn.addEventListener('click',()=>{
      if(document.fullscreenElement===card){ document.exitFullscreen?.(); return; }
      card.requestFullscreen?.();
    });
    card.insertBefore(btn, card.firstChild);
  });
}

function initProgress(){
  const ship=document.querySelector('.nav__ship');
  const nav=document.querySelector('.nav');
  const links=[...document.querySelectorAll('.nav__menu a')];
  const linkById=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
  const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
  function setActive(id){
    links.forEach(a=>a.classList.toggle('is-active',a.getAttribute('href')===`#${id}`));
    const link=linkById.get(id); if(!link||!ship||!nav) return;
    const navRect=nav.getBoundingClientRect(), linkRect=link.getBoundingClientRect();
    const center=linkRect.left - navRect.left + linkRect.width/2;
    ship.style.left=`${center}px`;
    ship.style.transform='translateX(-50%)';
  }
  let activeId=sections[0]?.id;
  const io=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{ if(entry.isIntersecting) activeId=entry.target.id; });
    if(activeId) setActive(activeId);
  },{rootMargin:'-35% 0px -50% 0px',threshold:[0,0.2,0.6]});
  sections.forEach(sec=>io.observe(sec));
  if(activeId) setActive(activeId);
  window.addEventListener('resize',()=>{ if(activeId) setActive(activeId); });
}
function fillHero(ba,mk){const b=ba.find(d=>d.period.startsWith('Before')),a=ba.find(d=>d.period.startsWith('After'));const tc=document.getElementById('hero-transit-change');const hb=document.getElementById('hero-brent');if(tc&&b&&a){tc.textContent=`${fmt.sp(a.avg_total_transits_per_day/b.avg_total_transits_per_day-1)} daily`;}const p=mk.filter(d=>d.date>=pd('2026-01-01')&&d.brent);if(hb&&p.length){hb.textContent=`${fmt.usd(p[p.length-1].brent)}/bbl`;}}

let rankData=[];
function renderRank(D){
  upP('#rank-period-pills',st.rkPeriod==='Before HORMUZ-26'?'Before':'After');
  upP('#rank-metric-pills',st.rkMetric==='avg_tanker'?'Tankers/day':'Tanker %');
  d3.select('#rank-kicker').text(`ranking · ${st.rkPeriod==='Before HORMUZ-26'?'before HORMUZ-26':'after HORMUZ-26'}`);
  const svg=d3.select('#rank-chart'),{W,H}=cS(svg,390);
  const m={top:12,right:54,bottom:30,left:124};
  const all=chokepointPeriodData(D.chDaily, st.rkPeriod).sort((a,b)=>d3.descending(a[st.rkMetric],b[st.rkMetric]));
  const hormuz=all.find(d=>d.portid==='chokepoint6');
  const selected=st.selectedChokepoint?all.find(d=>d.portid===st.selectedChokepoint):null;
  rankData=all;
  let top=all.slice(0,15);
  [hormuz,selected].forEach(extra=>{
    if(extra && !top.some(d=>d.portid===extra.portid)) top.push(extra);
  });
  top=top.sort((a,b)=>d3.descending(a[st.rkMetric],b[st.rkMetric]));
  if(!top.length) return;
  const max=d3.max(top,d=>d[st.rkMetric])||1;
  const x=d3.scaleLinear().domain([0,max*1.08]).range([m.left,W-m.right]).nice();
  const y=d3.scaleBand().domain(top.map(d=>d.portname)).range([m.top,H-m.bottom]).padding(.18);
  svg.append('g').attr('class','grid').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickSize(-(H-m.top-m.bottom)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(g=>g.select('.domain').remove()).selectAll('text').style('font-size','8px');
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d=>st.rkMetric==='tanker_share'?fmt.pct(d):fmt.one(d)));
  const bars=svg.selectAll('.rk').data(top).join('g').attr('class','rk');
  bars.append('rect').attr('x',m.left).attr('y',d=>y(d.portname)).attr('height',y.bandwidth()).attr('rx',4)
    .attr('width',d=>Math.max(0,x(d[st.rkMetric])-m.left))
    .attr('fill',d=>d.portid===st.selectedChokepoint?C.gold:(d.portid==='chokepoint6'?C.orange:C.sea))
    .attr('opacity',d=>d.portid===st.selectedChokepoint||d.portid==='chokepoint6'?1:.55)
    .attr('data-portid',d=>d.portid)
    .on('mousemove',(ev,d)=>showT(ev,`<strong>${d.portname}</strong>${st.rkMetric==='avg_tanker'?'Tankers per day':'Tankers as share of traffic'}: ${st.rkMetric==='tanker_share'?fmt.pct(d[st.rkMetric]):fmt.one(d[st.rkMetric])}<br>Total traffic: ${fmt.one(d.avg_total)} ships/day<br>Tanker traffic: ${fmt.one(d.avg_tanker)} ships/day`))
    .on('mouseleave',hideT)
    .on('click',(ev,d)=>{st.selectedChokepoint=d.portid;highlightBar(d.portid);const iframe=document.getElementById('world-map-iframe');if(iframe)iframe.contentWindow.postMessage({type:'highlight-chokepoint',portid:d.portid},'*');});
  bars.append('text').attr('x',d=>x(d[st.rkMetric])+5).attr('y',d=>y(d.portname)+y.bandwidth()/2+3).attr('class','bar-label').style('font-size','8px').text(d=>st.rkMetric==='tanker_share'?fmt.pct(d[st.rkMetric]):fmt.one(d[st.rkMetric]));
  const rank=all.findIndex(d=>d.portid==='chokepoint6')+1;
  const periodText=st.rkPeriod==='Before HORMUZ-26'?'2026-01-01 to 2026-02-28':'2026-03-01 to 2026-05-17';
  const base=st.rkMetric==='avg_tanker'
    ? `${st.rkPeriod}. Ranking shows the top 15 chokepoints by average tankers/day, using ${periodText}. Hormuz ranks #${rank}/28.`
    : `${st.rkPeriod}. Ranking shows the top 15 chokepoints by tanker share, using ${periodText}. Hormuz ranks #${rank}/28.`;
  d3.select('#rank-read').text(`${base} Source: IMF PortWatch.`);
}

function highlightBar(pid){
  d3.selectAll('#rank-chart rect[data-portid]').attr('fill',function(){const p=d3.select(this).attr('data-portid');return p===pid?C.gold:p==='chokepoint6'?C.orange:C.sea;}).attr('opacity',function(){const p=d3.select(this).attr('data-portid');return p===pid||p==='chokepoint6'?1:.55;});
}
function rkF(v,k){return k==='tanker_share'?fmt.pct(v):k.includes('capacity')?fmt.si(v):fmt.one(v);}
function rkL(k){return({avg_total:'Avg daily transits',avg_tanker:'Avg daily tankers',avg_capacity:'Avg daily capacity',tanker_share:'Tanker share'})[k]||k;}

const vesselSeries=[
  {key:'n_tanker',label:'Tankers',color:C.orange},
  {key:'n_container',label:'Containers',color:C.sea},
  {key:'n_dry_bulk',label:'Dry bulk',color:C.sea2},
  {key:'n_general_cargo',label:'General cargo',color:'#8aa78c'},
  {key:'n_roro',label:'Ro-Ro',color:'#c5a760'}
];
function renderMixArea(hz){
  upP('#traffic-periods',st.tPeriod);
  const svg=d3.select('#mix-area-chart'),{W,H}=cS(svg,430);
  const m={top:22,right:16,bottom:30,left:58};
  const raw=fP(hz,st.tPeriod);
  if(!raw.length)return;
  const keys=vesselSeries;
  let data=raw;
  if(st.tPeriod==='Full record'){
    const grouped=d3.groups(raw,d=>`${d.date.getFullYear()}-${String(d.date.getMonth()+1).padStart(2,'0')}`);
    data=grouped.map(([k,arr])=>{
      const [y,mo]=k.split('-').map(Number);
      const out={date:new Date(y,mo-1,1)};
      keys.forEach(v=>out[v.key]=d3.mean(arr,d=>d[v.key])||0);
      return out;
    }).sort((a,b)=>d3.ascending(a.date,b.date));
  }
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const innerTop=m.top+4, innerBottom=H-m.bottom;
  const panelGap=12;
  const panelH=(innerBottom-innerTop-panelGap*(keys.length-1))/keys.length;
  const line=d3.line().x(d=>x(d.date)).y(d=>d.y).curve(d3.curveMonotoneX);
  const sharedMax=d3.max(data,d=>d3.max(keys,v=>d[v.key]))||1;
  keys.forEach((v,i)=>{
    const y0=innerTop+i*(panelH+panelGap);
    const y1=y0+panelH;
    const y=d3.scaleLinear().domain([0,sharedMax*1.1]).nice().range([y1,y0]);
    svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove()).call(g=>g.selectAll('line').attr('y1',0));
    svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(3)).call(g=>g.selectAll('text').style('font-size','8px'));
    svg.append('path').datum(data.map(d=>({date:d.date,y:y(d[v.key]),value:d[v.key]}))).attr('fill','none').attr('stroke',v.color).attr('stroke-width',2.1).attr('d',line);
    svg.append('text').attr('x',m.left).attr('y',y0-6).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).attr('fill',v.color).text(v.label);
    if(i<keys.length-1){ svg.append('line').attr('x1',m.left).attr('x2',W-m.right).attr('y1',y1+panelGap/2).attr('y2',y1+panelGap/2).attr('stroke','rgba(14,74,66,.08)'); }
    const evDate=pd('2026-03-01'); if(evDate>=x.domain()[0]&&evDate<=x.domain()[1]) svg.append('line').attr('class','event-line').attr('x1',x(evDate)).attr('x2',x(evDate)).attr('y1',y0).attr('y2',y1);
  });
  const xTicks=st.tPeriod==='Full record'?d3.timeYear.every(1):d3.timeMonth.every(1);
  const xFmt=st.tPeriod==='Full record'?d3.timeFormat('%Y'):fmt.dS;
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(xTicks).tickFormat(xFmt));
  const evDate=pd('2026-03-01'); if(evDate>=x.domain()[0]&&evDate<=x.domain()[1]) svg.append('text').attr('x',x(evDate)+5).attr('y',m.top).attr('fill',C.orange).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).text('HORMUZ-26');
  addH(svg,data,x,{top:m.top,bottom:m.bottom,left:m.left},H,d=>`<strong>${st.tPeriod==='Full record'?d3.timeFormat('%b %Y')(d.date):fmt.date(d.date)}</strong>Tankers: ${fmt.num(d.n_tanker)}<br>Containers: ${fmt.num(d.n_container)}<br>Dry bulk: ${fmt.num(d.n_dry_bulk)}<br>General cargo: ${fmt.num(d.n_general_cargo)}<br>Ro-Ro: ${fmt.num(d.n_roro)}`);
  const before=raw.filter(d=>d.date<pd('2026-03-01')),after=raw.filter(d=>d.date>=pd('2026-03-01'));
  const bTk=d3.mean(before,d=>d.n_tanker)||0,aTk=d3.mean(after,d=>d.n_tanker)||0;
  d3.select('#mix-area-read').text(`${st.tPeriod}. Each vessel class has its own panel and all panels share the same y-scale, so you can compare both the size of each class and the post-HORMUZ drop. Ro-Ro is now included as well. Tankers fall from ${fmt.one(bTk)} to ${fmt.one(aTk)} per day after HORMUZ-26. Source: IMF PortWatch.`);
}

function renderMix(hz){
  const svg=d3.select('#mix-chart'),{W,H}=cS(svg,280);
  const data=fP(hz,st.tPeriod);
  const vals=vesselSeries.map(v=>({label:v.label,value:d3.sum(data,d=>d[v.key]),color:v.color,key:v.key}));
  const total=d3.sum(vals,d=>d.value)||1;vals.forEach(d=>d.share=d.value/total);
  const cx=W*.34,cy=H/2+4,rO=Math.min(W*.26,cy)-20,rI=rO*.56;
  const pie=d3.pie().value(d=>d.value).sort(null).padAngle(.02);
  const arc=d3.arc().innerRadius(rI).outerRadius(rO).cornerRadius(4);
  svg.selectAll('.arc').data(pie(vals)).join('g').attr('class','arc').attr('transform',`translate(${cx},${cy})`).append('path').attr('d',arc).attr('fill',d=>d.data.color).attr('opacity',.88).on('mousemove',(ev,d)=>showT(ev,`<strong>${d.data.label}</strong>${fmt.num(d.data.value)} transits · ${fmt.pct(d.data.share)}`)).on('mouseleave',hideT);
  svg.append('text').attr('x',cx).attr('y',cy-6).attr('text-anchor','middle').attr('font-family','Space Mono').attr('font-size',9).attr('fill',C.soft).text('TANKER SHARE');
  svg.append('text').attr('x',cx).attr('y',cy+14).attr('text-anchor','middle').attr('font-family','Bebas Neue').attr('font-size',28).attr('fill',C.oil).text(fmt.pct(vals[0].share));
  const lx=W*.56,ly=Math.max(22,H/2-54);vals.slice(0,5).forEach((v,i)=>{svg.append('rect').attr('x',lx).attr('y',ly+i*18).attr('width',14).attr('height',7).attr('rx',3).attr('fill',v.color);svg.append('text').attr('x',lx+20).attr('y',ly+i*18+7).attr('font-family','Space Mono').attr('font-size',9).attr('fill',C.soft).text(`${v.label} ${fmt.pct(v.share)}`);});
  d3.select('#mix-read').text(`${st.tPeriod}: tankers make up ${fmt.pct(vals[0].share)} of the shown vessel classes. Source: IMF PortWatch.`);
}

function renderTraffic(hz,ev){
  upP('#traffic-periods',st.tPeriod);
  const svg=d3.select('#traffic-chart'),{W,H}=cS(svg,320);
  const m={top:18,right:22,bottom:32,left:50};
  const data=fP(hz,st.tPeriod); if(!data.length)return;
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const y=d3.scaleLinear().domain([0,d3.max(data,d=>d.n_total_ma7)*1.12||1]).nice().range([H-m.bottom,m.top]);
  const yrs=(x.domain()[1]-x.domain()[0])/(864e5*365);
  const xT=yrs<=1?d3.timeMonth.every(1):yrs<=3?d3.timeMonth.every(3):d3.timeYear.every(1);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(xT).tickFormat(yrs<=1?d3.timeFormat('%b %Y'):fmt.dS));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append('path').datum(data).attr('fill',C.sea).attr('fill-opacity',.08).attr('d',d3.area().x(d=>x(d.date)).y0(H-m.bottom).y1(d=>y(d.n_total_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill','none').attr('stroke',C.sea).attr('stroke-width',2.2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.n_total_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill',C.orange).attr('fill-opacity',.06).attr('d',d3.area().x(d=>x(d.date)).y0(H-m.bottom).y1(d=>y(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill','none').attr('stroke',C.orange).attr('stroke-width',1.6).attr('opacity',.75).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  const evD=ev[0]?.fromdate_parsed||pd('2026-03-01');if(evD>=x.domain()[0]&&evD<=x.domain()[1])addEv(svg,x(evD),m.top,H-m.bottom,'HORMUZ-26');
  const aT=d3.mean(data,d=>d.n_total),aTk=d3.mean(data,d=>d.n_tanker);
  d3.select('#traffic-metrics').selectAll('.metric-card').data([['Avg transits/day',fmt.one(aT),'all types'],['Avg tankers/day',fmt.one(aTk),`${fmt.pct(aTk/aT)} of traffic`],['Days',fmt.num(data.length),st.tPeriod]]).join('article').attr('class','metric-card').html(d=>`<span>${d[0]}</span><strong>${d[1]}</strong><small>${d[2]}</small>`);
  addL(svg,W-m.right-190,m.top+4,[['Total',C.sea],['Tankers',C.orange]]);
  addH(svg,data,x,m,H,d=>`<strong>${fmt.date(d.date)}</strong>Total: ${fmt.num(d.n_total)}<br>Tankers: ${fmt.num(d.n_tanker)}<br>Capacity: ${fmt.num(d.capacity)}`);
  d3.select('#traffic-read').text('The 7-day average shows both total vessel traffic and tanker traffic collapsing after the HORMUZ-26 marker.');
}
function renderBA(ba){
  const b=ba.find(d=>d.period.startsWith('Before')),a=ba.find(d=>d.period.startsWith('After'));if(!b||!a)return;
  const rows=[['Total transits/day',b.avg_total_transits_per_day,a.avg_total_transits_per_day],['Tankers/day',b.avg_tankers_per_day,a.avg_tankers_per_day],['Capacity/day',b.avg_capacity_per_day,a.avg_capacity_per_day]];
  d3.select('#before-after-grid').selectAll('.ba-card').data(rows).join('article').attr('class','ba-card').html(d=>{const p=d[1]?(d[2]/d[1]-1):0;const f=k=>d[0].includes('Capacity')?fmt.si(k):fmt.one(k);return`<span class="ba-card__label">${d[0]}</span><span class="ba-card__before">${f(d[1])}</span><span class="ba-card__arrow">↓</span><span class="ba-card__after">${f(d[2])}</span><span class="ba-card__change">${fmt.sp(p)}</span>`;});
}

function renderFlowBars(origins,destinations){
  renderFlowBar('#destination-chart',destinations,'destination','#0f4d46',false);
  renderFlowBar('#origin-chart',origins,'origin',C.orange,false);
  const asia=destinations.filter(d=>['China','India','South Korea','Japan','Other Asia'].includes(d.label));
  const asiaShare=d3.sum(asia,d=>d.mbd_2024)/d3.sum(destinations,d=>d.mbd_2024);
  d3.select('#destination-read').text(`EIA/Vortexa 2024: ${fmt.pct(asiaShare)} of the destination markets shown here are in Asia; Europe is also included as a grouped destination from the source figure. Source: U.S. EIA figure data based on Vortexa.`);
  const topOrigin=origins.slice().sort((a,b)=>d3.descending(a.mbd_2024,b.mbd_2024))[0];
  d3.select('#origin-read').text(`${topOrigin.label} is the largest named origin in the EIA figure data, at ${fmt.mbd(topOrigin.mbd_2024)} in 2024. Source: U.S. EIA figure data based on Vortexa.`);
}
function renderFlowBar(sel,data,kind,color,keepAggregates){
  const svg=d3.select(sel),{W,H}=cS(svg,290);
  const m={top:14,right:44,bottom:28,left:kind==='destination'?112:132};
  const rows=data.filter(d=>keepAggregates||!d.is_aggregate||d.label==='Europe').sort((a,b)=>d3.descending(a.mbd_2024,b.mbd_2024));
  const x=d3.scaleLinear().domain([0,d3.max(rows,d=>d.mbd_2024)*1.12]).nice().range([m.left,W-m.right]);
  const y=d3.scaleBand().domain(rows.map(d=>d.is_aggregate?`${d.label} *`:d.label)).range([m.top,H-m.bottom]).padding(.18);
  svg.append('g').attr('class','grid').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickSize(-(H-m.top-m.bottom)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(g=>g.select('.domain').remove()).selectAll('text').style('font-size','8px');
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d=>`${fmt.one(d)}M`));
  svg.selectAll('.flow-bar').data(rows).join('rect').attr('class','flow-bar').attr('x',m.left).attr('y',d=>y(d.is_aggregate?`${d.label} *`:d.label)).attr('width',d=>x(d.mbd_2024)-m.left).attr('height',y.bandwidth()).attr('rx',5).attr('fill',color).attr('opacity',.78).on('mousemove',(ev,d)=>showT(ev,`<strong>${d.label}</strong>${fmt.mbd(d.mbd_2024)}${d.share_2024?` · ${fmt.pct(d.share_2024)}`:''}${d.is_aggregate?'<br>Aggregated region label in EIA data':''}`)).on('mouseleave',hideT);
  svg.selectAll('.flow-label').data(rows).join('text').attr('class','bar-label').attr('x',d=>x(d.mbd_2024)+4).attr('y',d=>y(d.is_aggregate?`${d.label} *`:d.label)+y.bandwidth()/2+3).style('font-size','8px').text(d=>fmt.one(d.mbd_2024));
}

function renderPrices(mk){
  const svg=d3.select('#price-chart'),{W,H}=cS(svg,300);
  const m={top:16,right:20,bottom:30,left:44};
  const data=mk.filter(d=>d.date>=pd('2025-11-01')&&(d.brent||d.jetBbl));if(data.length<2)return;
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const y=d3.scaleLinear().domain([0,d3.max(data,d=>Math.max(d.brent||0,d.jetBbl||0))*1.08]).nice().range([H-m.bottom,m.top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat(fmt.dS));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>`$${d}`));
  svg.append('path').datum(data.filter(d=>d.brent)).attr('fill','none').attr('stroke',C.oil).attr('stroke-width',2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.brent)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data.filter(d=>d.jetBbl)).attr('fill','none').attr('stroke',C.orange).attr('stroke-width',2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.jetBbl)).curve(d3.curveMonotoneX));
  const evX=x(pd('2026-03-01')); svg.append('line').attr('class','event-line').attr('x1',evX).attr('x2',evX).attr('y1',m.top+6).attr('y2',H-m.bottom).attr('stroke-width',1.5); svg.append('text').attr('x',evX+5).attr('y',m.top+18).attr('fill',C.orange).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).text('HORMUZ-26');
  addL(svg,W-m.right-190,m.top+4,[['Brent crude',C.oil],['Jet fuel/bbl',C.orange]]);
  addH(svg,data,x,m,H,d=>`<strong>${fmt.date(d.date)}</strong>Brent: ${d.brent?fmt.usd(d.brent):'-'}<br>Jet: ${d.jetBbl?fmt.usd(d.jetBbl):'-'}`);
  d3.select('#price-read').text('Global oil benchmarks respond quickly after the disruption marker; this sets up the downstream Greek pump-price story. Source: FRED / U.S. EIA.');
}
function renderGreece(gn){
  const fuelLabel={a95:'Unleaded 95',a100:'Unleaded 100',diesel_kinisis:'Diesel',diesel_thermansis:'Heating diesel',lpg:'LPG (Autogas)'}[st.grFuel]||st.grFuel;
  upP('#greece-fuel-pills',FUEL_LABELS[st.grFuel]||'A95');
  const svg=d3.select('#greece-chart'),{W,H}=cS(svg,300);
  const m={top:16,right:20,bottom:30,left:44};
  const data=gn.map(d=>({date:pd(d.date),val:+d[st.grFuel]||null})).filter(d=>d.date&&d.val);
  if(data.length<2)return;
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const y=d3.scaleLinear().domain([d3.min(data,d=>d.val)*.95,d3.max(data,d=>d.val)*1.05]).nice().range([H-m.bottom,m.top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat(fmt.dS));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>`€${d.toFixed(2)}`));
  svg.append('path').datum(data).attr('fill',C.sea).attr('fill-opacity',.1).attr('d',d3.area().x(d=>x(d.date)).y0(H-m.bottom).y1(d=>y(d.val)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill','none').attr('stroke',C.sea).attr('stroke-width',2.2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.val)).curve(d3.curveMonotoneX));
  const evD=pd('2026-03-01');if(evD>=x.domain()[0]&&evD<=x.domain()[1])addEv(svg,x(evD),m.top,H-m.bottom,'HORMUZ-26');
  addH(svg,data,x,m,H,d=>`<strong>${fmt.date(d.date)}</strong>${fuelLabel}: ${fmt.eur(d.val)}/litre`);
  const first=data[0].val,last=data[data.length-1].val,chg=(last/first-1);
  d3.select('#greece-read').text(`${fuelLabel}: ${fmt.eur(first)} to ${fmt.eur(last)} (${fmt.sp(chg)}). Source: fuelprices.gr, Hellenic Ministry of Development.`);
}
function renderDecomposition(parts){
  const svg=d3.select('#decomposition-chart'),{W,H}=cS(svg,250);
  const m={top:30,right:28,bottom:30,left:80};
  const pre=parts.filter(d=>d.date<pd('2026-03-01'));
  const post=parts.filter(d=>d.date>=pd('2026-03-01'));
  if(!pre.length||!post.length)return;
  const avg=(arr,key)=>d3.mean(arr,d=>d[key])||0;
  const rows=[
    {label:'A95 · before',fuel:'A95',period:'before',refinery:avg(pre,'a95_refinery'),taxes:avg(pre,'a95_taxes'),margin:avg(pre,'a95_margin'),retail:avg(pre,'a95_retail')},
    {label:'A95 · after',fuel:'A95',period:'after',refinery:avg(post,'a95_refinery'),taxes:avg(post,'a95_taxes'),margin:avg(post,'a95_margin'),retail:avg(post,'a95_retail')},
    {label:'Diesel · before',fuel:'Diesel',period:'before',refinery:avg(pre,'diesel_refinery'),taxes:avg(pre,'diesel_taxes'),margin:avg(pre,'diesel_margin'),retail:avg(pre,'diesel_retail')},
    {label:'Diesel · after',fuel:'Diesel',period:'after',refinery:avg(post,'diesel_refinery'),taxes:avg(post,'diesel_taxes'),margin:avg(post,'diesel_margin'),retail:avg(post,'diesel_retail')}
  ];
  const comps=[{key:'refinery',label:'Refinery / crude-linked',color:C.orange},{key:'taxes',label:'Taxes & fees',color:C.sea},{key:'margin',label:'Retail / wholesale margin',color:'#c5a760'}];
  const x=d3.scaleLinear().domain([0,d3.max(rows,d=>d.retail)*1.08]).range([m.left,W-m.right]);
  const y=d3.scaleBand().domain(rows.map(d=>d.label)).range([m.top,H-m.bottom]).padding(.28);
  svg.append('g').attr('class','grid').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H-m.top-m.bottom)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d=>`€${d.toFixed(2)}`));
  rows.forEach(row=>{
    let acc=0;
    comps.forEach(c=>{
      svg.append('rect').attr('x',x(acc)).attr('y',y(row.label)).attr('width',Math.max(0,x(acc+row[c.key])-x(acc))).attr('height',y.bandwidth()).attr('fill',c.color).attr('opacity',row.period==='after'?0.88:0.58).on('mousemove',ev=>showT(ev,`<strong>${row.label} · ${c.label}</strong>${fmt.eur(row[c.key])}/litre`)).on('mouseleave',hideT);
      acc += row[c.key];
    });
    svg.append('text').attr('class','bar-label').attr('x',x(row.retail)+5).attr('y',y(row.label)+y.bandwidth()/2+4).text(fmt.eur(row.retail));
  });
  addL(svg,m.left,m.top-18,comps.map(d=>[d.label,d.color]),{gapX:118});
  const a95MarginBefore=avg(pre,'a95_margin'), a95MarginAfter=avg(post,'a95_margin');
  const a95RefBefore=avg(pre,'a95_refinery'), a95RefAfter=avg(post,'a95_refinery');
  d3.select('#decomposition-read').text(`Average before vs after HORMUZ-26: the largest change in A95 comes from the refinery/crude-linked component (${fmt.eur(a95RefBefore)} → ${fmt.eur(a95RefAfter)}), while the retail/wholesale margin does not increase (${fmt.eur(a95MarginBefore)} → ${fmt.eur(a95MarginAfter)}).`);
}

function cleanGreekSearch(s){return (s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function renderNomos(ga){
  upP('#nomos-mode-pills',st.nomosMode==='price'?'Latest price':'Change since HORMUZ-26');
  upP('#nomos-fuel-pills',FUEL_LABELS[st.nomosFuel]||'A95');
  const svg=d3.select('#nomos-chart'),{W,H}=cS(svg,400);
  const m={top:18,right:62,bottom:30,left:142};
  const cols=Object.keys(ga[0]).filter(k=>k!=='nomos');
  const lastCol=[...cols].reverse().find(c=>ga.some(d=>Number.isFinite(+d[c]) && +d[c]>0)) || cols[cols.length-1];
  const beforeCol=[...cols].reverse().find(c=>c<'2026-03-01' && ga.some(d=>Number.isFinite(+d[c]) && +d[c]>0));
  const all=ga.map(d=>{
    const price=+d[lastCol]||null;
    const before=beforeCol?(+d[beforeCol]||null):null;
    const delta=(price&&before)?price/before-1:null;
    const metric=st.nomosMode==='price'?price:delta;
    return {nomos:d.nomos,short:normNomos(d.nomos),price,before,delta,metric};
  }).filter(d=>d.price && Number.isFinite(d.metric)).sort((a,b)=>d3.descending(a.metric,b.metric));
  const min=d3.min(all,d=>d.metric), max=d3.max(all,d=>d.metric);
  const color=d3.scaleSequential().domain([min,max]).interpolator(d3.interpolateRgbBasis(['#fff3bf','#f5c267','#e79c49','#b25d33']));
  const top=all.slice(0,5), bottom=all.slice(-5).reverse();
  const byName=new Map(all.map(d=>[d.nomos,d]));
  const baseline=[];
  const add=d=>{if(d && !baseline.some(x=>x.nomos===d.nomos)) baseline.push(d);};
  top.forEach(add); bottom.forEach(add);
  const att=all.find(d=>d.short==='ΑΤΤΙΚΗΣ'); add(att);
  let data=[...baseline];
  const qUse=cleanGreekSearch(st.nomosQuery);
  let qMatch=null;
  if(qUse){
    qMatch=all.find(d=>cleanGreekSearch(d.short).includes(qUse) || cleanGreekSearch(d.nomos).includes(qUse));
    if(qMatch && !data.some(x=>x.nomos===qMatch.nomos)) data.push(qMatch);
    if(qMatch) st.nomos=qMatch.nomos;
  }
  if(st.nomos && byName.has(st.nomos) && !data.some(x=>x.nomos===st.nomos)) data.push(byName.get(st.nomos));
  data=data.sort((a,b)=>d3.descending(a.metric,b.metric));
  const xDomain=st.nomosMode==='change' ? [Math.min(0,d3.min(data,d=>d.metric)), d3.max(data,d=>d.metric)*1.06] : [d3.min(data,d=>d.metric)*.985,d3.max(data,d=>d.metric)*1.01];
  const x=d3.scaleLinear().domain(xDomain).range([m.left,W-m.right]);
  const y=d3.scaleBand().domain(data.map(d=>d.short)).range([m.top,H-m.bottom]).padding(.18);
  const axis=svg.append('g').attr('class','axis nomos-axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(g=>g.select('.domain').remove());
  axis.selectAll('text').style('font-size','8px').attr('fill',d=>{ const row=data.find(r=>r.short===d); return row && st.nomos===row.nomos && !baseline.some(b=>b.nomos===row.nomos) ? C.orange : C.soft; }).style('font-weight',d=>{ const row=data.find(r=>r.short===d); return row && st.nomos===row.nomos && !baseline.some(b=>b.nomos===row.nomos) ? 700 : 400; });
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d=>st.nomosMode==='price'?`€${d.toFixed(2)}`:fmt.sp(d)));
  svg.selectAll('.nm').data(data).join('rect').attr('class','nm').attr('data-nomos',d=>d.nomos).attr('x',d=>st.nomosMode==='change'?x(Math.min(0,d.metric)):m.left).attr('y',d=>y(d.short)).attr('width',d=>st.nomosMode==='change'?Math.abs(x(d.metric)-x(0)):Math.max(0,x(d.metric)-m.left)).attr('height',y.bandwidth()).attr('rx',4).attr('fill',d=>color(d.metric)).attr('stroke',d=>d.nomos===st.nomos?C.oil:'none').attr('stroke-width',d=>d.nomos===st.nomos?1.4:0).attr('opacity',.94).on('mousemove',(ev,d)=>showT(ev,`<strong>${d.short}</strong>${FUEL_LABELS[st.nomosFuel]} latest: ${fmt.eur(d.price)}/litre<br>Before HORMUZ-26, ${beforeCol}: ${d.before?fmt.eur(d.before):'-'}<br>Change since then: ${d.delta!==null?fmt.sp(d.delta):'-'}`)).on('mouseleave',hideT).on('click',(ev,d)=>highlightNomos(d.nomos,true));
  svg.selectAll('.nml').data(data).join('text').attr('class','nml bar-label').style('font-size','7.5px').attr('x',d=>st.nomosMode==='change'?x(d.metric)+5:x(d.metric)+4).attr('y',d=>y(d.short)+y.bandwidth()/2+2.5).text(d=>st.nomosMode==='price'?fmt.eur(d.price):fmt.sp(d.delta));
  const searchedText=qUse ? (qMatch ? ` Added searched prefecture: ${qMatch.short}.` : ' No prefecture matches the search yet.') : '';
  const viewText=st.nomosMode==='price'?'latest fuel price':'percentage increase since the last pre-HORMUZ-26 value';
  d3.select('#nomos-read').text(`Current view: ${viewText}. List shows the 5 highest, the 5 lowest, plus Attica and any searched or selected prefecture. The change view compares ${lastCol} with ${beforeCol}. Source: fuelprices.gr, Hellenic Ministry of Development.${searchedText}`);
}

function highlightNomos(nomos,sendToMap=true){
  st.nomos=nomos; st.nomosAdded=nomos; renderNomos(nomosDataset(window.__DATA__));
  if(sendToMap){const iframe=document.getElementById('greece-map-iframe');if(iframe)iframe.contentWindow.postMessage({type:'highlight-nomos',nomos},'*');}
}

function initProposalModal(){
  const modal=document.getElementById('proposal-modal');
  if(!modal)return;
  const openers=document.querySelectorAll('[data-open-proposal]');
  const closers=document.querySelectorAll('[data-close-proposal]');
  const open=()=>{modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');};
  const close=()=>{modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');};
  openers.forEach(btn=>btn.addEventListener('click',open));
  closers.forEach(btn=>btn.addEventListener('click',close));
  modal.addEventListener('click',ev=>{if(ev.target===modal)close();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&modal.classList.contains('is-open'))close();});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initProposalModal);
}else{
  initProposalModal();
}
