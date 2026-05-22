/* ═══════════════════════════════════════════════════════════
   HORMUZ UNDER PRESSURE — script.js (v3 rewrite)
   ═══════════════════════════════════════════════════════════ */

const DATA = {
  hormuzDaily:    'data/processed/hormuz_daily.csv',
  chokeSummary:   'data/processed/chokepoints_summary.csv',
  beforeAfter:    'data/processed/hormuz_before_after.csv',
  events:         'data/processed/hormuz_events.csv',
  market:         'data/processed/market_prices.csv',
  chokeLocs:      'data/processed/chokepoint_locations.csv',
  gulfPorts:      'data/processed/gulf_ports_monthly.csv'
};

const PRICE_PERIODS = {
  '2026 Jan–May':    ['2026-01-01','2026-05-18'],
  'Around HORMUZ-26':['2026-02-01','2026-04-30']
};
const TRAFFIC_PERIODS = {
  '2026 Jan–May':  ['2026-01-01','2026-05-17'],
  '2025':          ['2025-01-01','2025-12-31'],
  'Full record':   ['2019-01-01','2026-05-17']
};

const fmt = {
  date:  d3.timeFormat('%d %b %Y'),
  dShort:d3.timeFormat('%b %Y'),
  dDay:  d3.timeFormat('%d %b'),
  num:   d3.format(',.0f'),
  one:   d3.format(',.1f'),
  usd:   d => `$${d3.format(',.0f')(d)}`,
  pct:   d3.format('.0%'),
  sPct:  d => `${d>=0?'+':'−'}${d3.format('.0%')(Math.abs(d))}`
};
const parseDate = d3.timeParse('%Y-%m-%d');
const tooltip   = d3.select('#tooltip');
const C = { sea:'#0f4d46', sea2:'#74b8a7', mint:'#bde7d8', orange:'#d36a38', oil:'#1a1a16', soft:'#6d8e86' };

const state = { pricePeriod:'2026 Jan–May', trafficPeriod:'2026 Jan–May', rankMetric:'avg_tanker' };

/* ─── BOOT ────────────────────────────────────────────────── */
Promise.all([
  d3.csv(DATA.hormuzDaily,  rH),
  d3.csv(DATA.chokeSummary, rS),
  d3.csv(DATA.beforeAfter,  rBA),
  d3.csv(DATA.events,       rE),
  d3.csv(DATA.market,       rM),
  d3.csv(DATA.chokeLocs),
  d3.csv(DATA.gulfPorts)
]).then(([hormuz, summaries, ba, events, market, locs, gulf]) => {
  const D = { hormuz, summaries, ba, events, market, locs, gulf };
  initProgress();
  initControls(D);
  renderAll(D);
  fillHeroCard(ba, market);
  // Lazy-init maps: only create when element is visible
  lazyInitMap('hormuz-map', ()=>initMap());
  lazyInitMap('flow-map',   ()=>initFlowMap(gulf));
  lazyInitMap('world-map',  ()=>initWorldMap(locs, summaries));
  window.addEventListener('resize', debounce(() => {
    renderAll(D);
    allMaps.forEach(m=>m.invalidateSize());
  }, 180));
});

/* ─── PARSERS ─────────────────────────────────────────────── */
function rH(d){ const o={...d, date:parseDate(d.date)}; ['n_total','n_tanker','n_cargo','n_container','n_dry_bulk','n_general_cargo','n_roro','capacity','capacity_tanker','capacity_cargo','n_total_ma7','n_tanker_ma7','n_cargo_ma7','capacity_ma7','capacity_tanker_ma7'].forEach(k=>o[k]=+d[k]||0); return o; }
function rS(d){ const o={...d}; ['days','avg_total','avg_tanker','avg_cargo','avg_capacity','avg_tanker_capacity','total_total','total_tanker','total_capacity','tanker_share'].forEach(k=>o[k]=+d[k]||0); return o; }
function rBA(d){ const o={...d}; ['days','avg_total_transits_per_day','avg_tankers_per_day','avg_capacity_per_day','avg_tanker_capacity_per_day','median_total_transits_per_day','median_tankers_per_day'].forEach(k=>o[k]=+d[k]||0); return o; }
function rE(d){ return {...d, fromdate_parsed: parseDate((d.fromdate_parsed||'').slice(0,10))}; }
function rM(d){ return { date:parseDate(d.date), brent:+d.brent_usd_per_barrel||null, jet:+d.jet_fuel_usd_per_gallon||null, jetBbl:+d.jet_fuel_usd_per_barrel_equiv||null }; }

/* ─── CONTROLS & RENDER ──────────────────────────────────── */
function initControls(D) {
  pills('#price-periods', Object.keys(PRICE_PERIODS), state.pricePeriod, v=>{ state.pricePeriod=v; renderAll(D); });
  pills('#traffic-periods', Object.keys(TRAFFIC_PERIODS), state.trafficPeriod, v=>{ state.trafficPeriod=v; renderAll(D); });
  d3.select('#rank-metric').on('change', ev=>{ state.rankMetric=ev.target.value; renderAll(D); });
}
let rerender=()=>{};
function renderAll(D) {
  rerender=()=>renderAll(D);
  renderPrices(D.market);
  renderTraffic(D.hormuz, D.events);
  renderRanking(D.summaries);
  renderMix(D.hormuz);
  renderImpact(D.hormuz, D.market, D.events);
  renderBeforeAfter(D.ba);
}

/* ─── UTILITIES ───────────────────────────────────────────── */
function pills(sel,vals,active,cb){
  d3.select(sel).selectAll('button').data(vals).join('button')
    .attr('type','button').attr('class',d=>d===active?'is-active':null)
    .text(d=>d).on('click',(_,d)=>cb(d));
}
function upPills(sel,active){ d3.select(sel).selectAll('button').attr('class',d=>d===active?'is-active':null); }
function fP(data,label,map){ const [s,e]=map[label].map(parseDate); return data.filter(d=>d.date>=s&&d.date<=e); }
function cSize(svg,h=300){ const n=svg.node(),w=n.clientWidth||680; svg.attr('viewBox',`0 0 ${w} ${h}`); svg.selectAll('*').remove(); return {width:w,height:h}; }
function showTip(ev,html){ tooltip.html(html).style('opacity',1); tooltip.style('left',`${Math.min(ev.clientX+12,window.innerWidth-260)}px`).style('top',`${ev.clientY+12}px`); }
function hideTip(){ tooltip.style('opacity',0); }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

function addEvent(svg,x,y1,y2,label){
  svg.append('line').attr('class','event-line').attr('x1',x).attr('x2',x).attr('y1',y1).attr('y2',y2);
  svg.append('text').attr('x',x+4).attr('y',y1+9).attr('fill',C.orange).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).text(label);
}
function addLeg(svg,x,y,items){
  const g=svg.append('g').attr('transform',`translate(${x},${y})`);
  items.forEach((it,i)=>{
    const gg=g.append('g').attr('transform',`translate(${i*100},0)`);
    gg.append('rect').attr('width',18).attr('height',6).attr('rx',3).attr('fill',it[1]);
    gg.append('text').attr('x',22).attr('y',6).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.soft).text(it[0]);
  });
}
function addHover(svg,data,x,m,h,tipFn){
  const bi=d3.bisector(d=>d.date).center;
  const fo=svg.append('g').style('display','none');
  fo.append('line').attr('y1',m.top).attr('y2',h-m.bottom).attr('stroke','rgba(14,74,66,.18)').attr('stroke-dasharray','3 4');
  svg.append('rect').attr('fill','transparent').attr('x',m.left).attr('y',m.top).attr('width',x.range()[1]-m.left).attr('height',h-m.top-m.bottom)
    .on('mousemove',ev=>{ const d=data[bi(data,x.invert(d3.pointer(ev)[0]))]; fo.style('display',null).attr('transform',`translate(${x(d.date)},0)`); showTip(ev,tipFn(d)); })
    .on('mouseleave',()=>{ fo.style('display','none'); hideTip(); });
}

/* ─── NAV PROGRESS ────────────────────────────────────────── */
function initProgress(){
  const ship=document.querySelector('.nav__ship');
  const fn=()=>{ const h=document.documentElement,max=h.scrollHeight-h.clientHeight,pct=max?window.scrollY/max:0; ship.style.left=`${pct*document.querySelector('.nav__progress').clientWidth}px`; };
  fn(); window.addEventListener('scroll',fn,{passive:true});
}

/* ─── HERO CARD FILL ──────────────────────────────────────── */
function fillHeroCard(ba,market){
  const bef=ba.find(d=>d.period.startsWith('Before')), aft=ba.find(d=>d.period.startsWith('After'));
  if(bef&&aft){ const p=(aft.avg_total_transits_per_day/bef.avg_total_transits_per_day-1); document.getElementById('hero-transit-change').textContent=`${fmt.sPct(p)} daily transits`; }
  const p26=market.filter(d=>d.date>=parseDate('2026-01-01')&&d.brent);
  if(p26.length>1){ const last=p26[p26.length-1]; document.getElementById('hero-brent').textContent=`${fmt.usd(last.brent)} / barrel`; }
}

/* ─── MAP CH01 ────────────────────────────────────────────── */
function initMap(){
  const map=L.map('hormuz-map',{scrollWheelZoom:false,zoomControl:true}).setView([26.35,56.65],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:11,attribution:'&copy; OSM'}).addTo(map);
  L.rectangle([[25.80,55.65],[26.85,57.75]],{color:'#d36a38',weight:2,fillColor:'#d36a38',fillOpacity:.08,dashArray:'6 7'}).addTo(map).bindPopup('<strong>Strait of Hormuz</strong><br>PortWatch chokepoint area.');
  L.polyline([[25.98,55.95],[26.14,56.26],[26.28,56.58],[26.36,56.9],[26.48,57.25]],{color:C.sea,weight:4,opacity:.85}).addTo(map);
  const ic=L.divIcon({className:'ship-marker',html:'<span>●</span>',iconSize:[14,14]});
  L.marker([26.29685,56.85985],{icon:ic}).addTo(map).bindPopup('<strong>HORMUZ-26</strong><br>PortWatch disruptions marker.');
  trackMap(map);
}

/* ─── FLOW MAP CH03 ───────────────────────────────────────── */
function initFlowMap(gulf){
  const map=L.map('flow-map',{scrollWheelZoom:false,zoomControl:false,attributionControl:false}).setView([25.5,54],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:10,attribution:'&copy; OSM'}).addTo(map);
  const hz=[26.35,56.65];
  const origins=[
    {name:'Saudi Arabia (Ras Tanura)',ll:[26.64,50.17],vol:6.2},
    {name:'Iraq (Basra)',ll:[29.73,48.82],vol:3.4},
    {name:'UAE (Fujairah)',ll:[25.13,56.35],vol:2.8},
    {name:'Kuwait (Mina al-Ahmadi)',ll:[29.06,48.16],vol:1.8},
    {name:'Qatar (Ras Laffan)',ll:[25.92,51.56],vol:1.4},
    {name:'Iran (Kharg Island)',ll:[29.23,50.33],vol:1.7}
  ];
  const mx=d3.max(origins,d=>d.vol);
  origins.forEach(o=>{
    const mid=[(o.ll[0]+hz[0])/2+.8,(o.ll[1]+hz[1])/2-1.2];
    L.polyline([o.ll,mid,hz],{color:C.orange,weight:Math.max(2,(o.vol/mx)*7),opacity:.5,smoothFactor:2}).addTo(map).bindPopup(`<strong>${o.name}</strong><br>~${o.vol}M b/d`);
    L.circleMarker(o.ll,{radius:5,color:C.sea,fillColor:C.orange,fillOpacity:.8,weight:1}).addTo(map);
  });
  L.circleMarker(hz,{radius:8,color:'#d36a38',fillColor:'#d36a38',fillOpacity:.25,weight:2,dashArray:'4 4'}).addTo(map);
  L.circleMarker(hz,{radius:3,color:'#d36a38',fillColor:'#d36a38',fillOpacity:1,weight:0}).addTo(map);
  trackMap(map);
}

/* ─── WORLD MAP CH04 ──────────────────────────────────────── */
function initWorldMap(locs,summaries){
  const map=L.map('world-map',{scrollWheelZoom:false,zoomControl:true,attributionControl:false}).setView([20,40],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:8,attribution:'&copy; OSM'}).addTo(map);
  const s26=summaries.filter(d=>d.period==='2026 YTD');
  const maxTk=d3.max(s26,d=>d.avg_tanker)||1;
  locs.forEach(loc=>{
    const s=s26.find(d=>d.portid===loc.portid);
    const tk=s?s.avg_tanker:0;
    const isH=loc.portid==='chokepoint6';
    const r=Math.max(3,Math.sqrt(tk/maxTk)*22);
    L.circleMarker([+loc.lat,+loc.lon],{
      radius:r,
      color:isH?'#d36a38':C.sea,
      fillColor:isH?'#d36a38':C.sea2,
      fillOpacity:isH?.6:.35,
      weight:isH?2.5:1
    }).addTo(map).bindPopup(`<strong>${loc.portname}</strong><br>Avg tankers/day: ${s?fmt.one(s.avg_tanker):'—'}<br>Tanker share: ${s?fmt.pct(s.tanker_share):'—'}<br>Avg total/day: ${s?fmt.one(s.avg_total):'—'}`);
  });
  trackMap(map);
}

const allMaps=[];

/* Lazy-init: don't create the map until its container is visible */
function lazyInitMap(elId, initFn){
  const el=document.getElementById(elId);
  if(!el) return;
  let inited=false;
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting && !inited){
        inited=true;
        // Container is now visible with correct dimensions
        initFn();
        obs.disconnect();
      }
    });
  },{threshold:0.01, rootMargin:'200px'});
  obs.observe(el);
}

/* Called from each init function after map creation */
function trackMap(map){
  allMaps.push(map);
  // Still do a few invalidations after creation for safety
  [50,200,500].forEach(ms=>setTimeout(()=>map.invalidateSize(),ms));
}

/* ─── PRICES CH02 ─────────────────────────────────────────── */
function renderPrices(market){
  upPills('#price-periods',state.pricePeriod);
  const svg=d3.select('#price-chart'), {width:W,height:H}=cSize(svg,320);
  const m={top:18,right:22,bottom:32,left:46};
  const data=fP(market,state.pricePeriod,PRICE_PERIODS).filter(d=>d.brent||d.jetBbl);
  if(data.length<2) return;
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const y=d3.scaleLinear().domain([0,d3.max(data,d=>Math.max(d.brent||0,d.jetBbl||0))*1.08]).nice().range([H-m.bottom,m.top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(W>600?7:4).tickFormat(fmt.dShort));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>`$${d}`));
  const ln=k=>d3.line().x(d=>x(d.date)).y(d=>y(d[k])).curve(d3.curveMonotoneX);
  svg.append('path').datum(data.filter(d=>d.brent)).attr('fill','none').attr('class','line-brent').attr('stroke-width',2).attr('d',ln('brent'));
  svg.append('path').datum(data.filter(d=>d.jetBbl)).attr('fill','none').attr('class','line-jet').attr('stroke-width',2).attr('d',ln('jetBbl'));
  const ev=parseDate('2026-03-01'); if(ev>=x.domain()[0]&&ev<=x.domain()[1]) addEvent(svg,x(ev),m.top,H-m.bottom,'HORMUZ-26');
  const last=[...data].reverse().find(d=>d.brent&&d.jetBbl), first=data.find(d=>d.brent&&d.jetBbl);
  const bC=first&&last?(last.brent/first.brent-1):0, jC=first&&last?(last.jetBbl/first.jetBbl-1):0;
  d3.select('#price-metrics').selectAll('.metric-card').data([
    ['Latest Brent',last?fmt.usd(last.brent):'—','USD/barrel'],
    ['Latest jet fuel',last?fmt.usd(last.jetBbl):'—','USD/bbl equiv.'],
    ['Period Δ',`${fmt.sPct(bC)} / ${fmt.sPct(jC)}`,'Brent / jet']
  ]).join('article').attr('class','metric-card').html(d=>`<span>${d[0]}</span><strong>${d[1]}</strong><small>${d[2]}</small>`);
  d3.select('#price-read').text(`${state.pricePeriod}: Brent and jet fuel benchmarks in the selected window. The HORMUZ-26 marker shows when the disruption was logged.`);
  addLeg(svg,W-m.right-195,m.top+4,[['Brent crude',C.oil],['Jet fuel/bbl',C.orange]]);
  addHover(svg,data,x,m,H,d=>`<strong>${fmt.date(d.date)}</strong>Brent: ${d.brent?fmt.usd(d.brent):'—'}<br>Jet fuel: ${d.jetBbl?fmt.usd(d.jetBbl):'—'}`);
}

/* ─── TRAFFIC CH03 ────────────────────────────────────────── */
function renderTraffic(hormuz,events){
  upPills('#traffic-periods',state.trafficPeriod);
  const svg=d3.select('#traffic-chart'), {width:W,height:H}=cSize(svg,320);
  const m={top:18,right:22,bottom:32,left:50};
  const data=fP(hormuz,state.trafficPeriod,TRAFFIC_PERIODS);
  const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,W-m.right]);
  const y=d3.scaleLinear().domain([0,d3.max(data,d=>d.n_total_ma7)*1.12||1]).nice().range([H-m.bottom,m.top]);
  const yrs=(x.domain()[1]-x.domain()[0])/(1000*60*60*24*365);
  const xT=yrs<=1?d3.timeMonth.every(1):(yrs<=3?d3.timeMonth.every(3):d3.timeYear.every(1));
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(xT).tickFormat(yrs<=1?d3.timeFormat('%b %Y'):fmt.dShort));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));
  // Area fill for total
  svg.append('path').datum(data).attr('fill',C.sea).attr('fill-opacity',.08).attr('d',d3.area().x(d=>x(d.date)).y0(H-m.bottom).y1(d=>y(d.n_total_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill','none').attr('class','line-primary').attr('stroke-width',2.2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.n_total_ma7)).curve(d3.curveMonotoneX));
  // Tanker overlay
  svg.append('path').datum(data).attr('fill',C.orange).attr('fill-opacity',.06).attr('d',d3.area().x(d=>x(d.date)).y0(H-m.bottom).y1(d=>y(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(data).attr('fill','none').attr('stroke',C.orange).attr('stroke-width',1.6).attr('opacity',.6).attr('d',d3.line().x(d=>x(d.date)).y(d=>y(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  const evD=events[0]?.fromdate_parsed||parseDate('2026-03-01');
  if(evD>=x.domain()[0]&&evD<=x.domain()[1]) addEvent(svg,x(evD),m.top,H-m.bottom,'HORMUZ-26');
  const aT=d3.mean(data,d=>d.n_total), aTk=d3.mean(data,d=>d.n_tanker), aC=d3.mean(data,d=>d.capacity);
  d3.select('#traffic-metrics').selectAll('.metric-card').data([
    ['Avg transits/day',fmt.one(aT),'all types, 7d avg'],
    ['Avg tankers/day',fmt.one(aTk),`${fmt.pct(aTk/aT)} of traffic`],
    ['Avg capacity/day',d3.format(',.2s')(aC),'estimated tonnage']
  ]).join('article').attr('class','metric-card').html(d=>`<span>${d[0]}</span><strong>${d[1]}</strong><small>${d[2]}</small>`);
  d3.select('#traffic-read').text(`${state.trafficPeriod}: total transits (green) and tankers (orange) through Hormuz, 7-day average. The area fill shows the gap between total and tanker traffic.`);
  addLeg(svg,W-m.right-190,m.top+4,[['Total transits',C.sea],['Tankers',C.orange]]);
  addHover(svg,data,x,m,H,d=>`<strong>${fmt.date(d.date)}</strong>Total: ${fmt.num(d.n_total)} ships<br>Tankers: ${fmt.num(d.n_tanker)}<br>Capacity: ${fmt.num(d.capacity)}`);
}

/* ─── RANKING CH04 ────────────────────────────────────────── */
function renderRanking(summaries){
  d3.select('#rank-metric').property('value',state.rankMetric);
  const svg=d3.select('#rank-chart'), {width:W,height:H}=cSize(svg,400);
  const m={top:14,right:55,bottom:26,left:135};
  const csvP='2026 YTD';
  let data=summaries.filter(d=>d.period===csvP).sort((a,b)=>d3.descending(a[state.rankMetric],b[state.rankMetric]));
  // Show ALL 28 chokepoints
  const top=data.slice(0,28);
  if(!top.length) return;
  const max=d3.max(top,d=>d[state.rankMetric])||1;
  const x=d3.scaleLinear().domain([0,max*1.08]).range([m.left,W-m.right]).nice();
  const y=d3.scaleBand().domain(top.map(d=>d.portname)).range([m.top,H-m.bottom]).padding(.15);
  svg.append('g').attr('class','grid').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H-m.top-m.bottom)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(g=>g.select('.domain').remove()).selectAll('text').style('font-size','7px');
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d=>rkF(d,state.rankMetric)));
  const bars=svg.selectAll('.rk').data(top).join('g').attr('class','rk');
  bars.append('rect').attr('x',m.left).attr('y',d=>y(d.portname)).attr('height',y.bandwidth()).attr('rx',4)
    .attr('width',d=>Math.max(0,x(d[state.rankMetric])-m.left))
    .attr('fill',d=>d.portid==='chokepoint6'?C.orange:C.sea).attr('opacity',d=>d.portid==='chokepoint6'?1:.55)
    .on('mousemove',(ev,d)=>showTip(ev,`<strong>${d.portname}</strong>${rkL(state.rankMetric)}: ${rkF(d[state.rankMetric],state.rankMetric)}<br>Tanker share: ${fmt.pct(d.tanker_share)}`))
    .on('mouseleave',hideTip);
  bars.filter(d=>x(d[state.rankMetric])-m.left>35).append('text').attr('x',d=>x(d[state.rankMetric])+4).attr('y',d=>y(d.portname)+y.bandwidth()/2+3).attr('class','bar-label').style('font-size','7px').text(d=>rkF(d[state.rankMetric],state.rankMetric));
  const rank=data.findIndex(d=>d.portid==='chokepoint6')+1;
  d3.select('#rank-read').text(`2026 Jan–May: Hormuz ranks #${rank} of 28 for ${rkL(state.rankMetric).toLowerCase()}. Switch the metric above to see why Hormuz dominates in tanker and energy metrics.`);
}
function rkF(v,k){ return k==='tanker_share'?fmt.pct(v):k.includes('capacity')?d3.format(',.2s')(v):fmt.one(v); }
function rkL(k){ return ({avg_total:'Average daily transits',avg_tanker:'Average daily tankers',avg_capacity:'Average daily capacity',tanker_share:'Tanker share'})[k]||k; }

/* ─── VESSEL MIX CH04 ─────────────────────────────────────── */
function renderMix(hormuz){
  const svg=d3.select('#mix-chart'), {width:W,height:H}=cSize(svg,240);
  const m={top:12,right:20,bottom:24,left:20};
  const data=hormuz.filter(d=>d.date>=parseDate('2026-01-01')&&d.date<=parseDate('2026-05-17'));
  const vals=[
    {label:'Tankers',value:d3.sum(data,d=>d.n_tanker),color:C.orange},
    {label:'Containers',value:d3.sum(data,d=>d.n_container),color:'#0f4d46'},
    {label:'Dry bulk',value:d3.sum(data,d=>d.n_dry_bulk),color:'#74b8a7'},
    {label:'General cargo',value:d3.sum(data,d=>d.n_general_cargo),color:'#8aa78c'},
    {label:'Ro-Ro',value:d3.sum(data,d=>d.n_roro),color:'#c5a760'}
  ];
  const total=d3.sum(vals,d=>d.value)||1;
  vals.forEach(d=>d.share=d.value/total);
  // Donut chart
  const cx=W/2, cy=H/2+4, rOuter=Math.min(cx,cy)-28, rInner=rOuter*.55;
  const pie=d3.pie().value(d=>d.value).sort(null).padAngle(.02);
  const arc=d3.arc().innerRadius(rInner).outerRadius(rOuter).cornerRadius(4);
  const arcs=svg.selectAll('.arc').data(pie(vals)).join('g').attr('class','arc').attr('transform',`translate(${cx},${cy})`);
  arcs.append('path').attr('d',arc).attr('fill',d=>d.data.color).attr('opacity',.85)
    .on('mousemove',(ev,d)=>showTip(ev,`<strong>${d.data.label}</strong>${fmt.num(d.data.value)} transits · ${fmt.pct(d.data.share)}`))
    .on('mouseleave',hideTip);
  // Center text
  svg.append('text').attr('x',cx).attr('y',cy-6).attr('text-anchor','middle').attr('font-family','Space Mono').attr('font-size',10).attr('fill',C.soft).text('TANKER SHARE');
  svg.append('text').attr('x',cx).attr('y',cy+14).attr('text-anchor','middle').attr('font-family','Bebas Neue').attr('font-size',28).attr('fill',C.oil).attr('letter-spacing','.03em').text(fmt.pct(vals[0].share));
  // Legend
  const lx=W-m.right-120, ly=m.top+6;
  vals.forEach((v,i)=>{
    const gy=ly+i*18;
    svg.append('rect').attr('x',lx).attr('y',gy).attr('width',14).attr('height',6).attr('rx',3).attr('fill',v.color);
    svg.append('text').attr('x',lx+20).attr('y',gy+6).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.soft).text(`${v.label} ${fmt.pct(v.share)}`);
  });
}

/* ─── IMPACT TIMELINE CH05 ────────────────────────────────── */
function renderImpact(hormuz,market,events){
  const svg=d3.select('#impact-chart'), {width:W,height:H}=cSize(svg,380);
  const m={top:14,right:22,bottom:30,left:46};
  const start=parseDate('2026-01-01'), end=parseDate('2026-05-17');
  const hData=hormuz.filter(d=>d.date>=start&&d.date<=end);
  const mData=market.filter(d=>d.date>=start&&d.date<=end&&d.brent);
  if(!hData.length||!mData.length) return;

  // Three stacked panels
  const panelH=(H-m.top-m.bottom-24)/3;
  const x=d3.scaleTime().domain([start,end]).range([m.left,W-m.right]);
  const evX=x(parseDate('2026-03-01'));

  // Shared x-axis at bottom
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(fmt.dShort));

  // Panel 1: Total transits
  const y1Top=m.top, y1Bot=m.top+panelH;
  const y1=d3.scaleLinear().domain([0,d3.max(hData,d=>d.n_total_ma7)*1.15]).range([y1Bot,y1Top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y1).ticks(3).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y1).ticks(3).tickFormat(d3.format('~s')));
  svg.append('path').datum(hData).attr('fill',C.sea).attr('fill-opacity',.1).attr('d',d3.area().x(d=>x(d.date)).y0(y1Bot).y1(d=>y1(d.n_total_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(hData).attr('fill','none').attr('stroke',C.sea).attr('stroke-width',2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y1(d.n_total_ma7)).curve(d3.curveMonotoneX));
  svg.append('text').attr('x',m.left+4).attr('y',y1Top+10).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.sea).attr('font-weight',700).text('TOTAL TRANSITS (7d avg)');

  // Panel 2: Tankers
  const y2Top=y1Bot+12, y2Bot=y2Top+panelH;
  const y2=d3.scaleLinear().domain([0,d3.max(hData,d=>d.n_tanker_ma7)*1.15]).range([y2Bot,y2Top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y2).ticks(3).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y2).ticks(3).tickFormat(d3.format('~s')));
  svg.append('path').datum(hData).attr('fill',C.orange).attr('fill-opacity',.1).attr('d',d3.area().x(d=>x(d.date)).y0(y2Bot).y1(d=>y2(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  svg.append('path').datum(hData).attr('fill','none').attr('stroke',C.orange).attr('stroke-width',2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y2(d.n_tanker_ma7)).curve(d3.curveMonotoneX));
  svg.append('text').attr('x',m.left+4).attr('y',y2Top+10).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.orange).attr('font-weight',700).text('TANKERS (7d avg)');

  // Panel 3: Brent crude
  const y3Top=y2Bot+12, y3Bot=H-m.bottom;
  const y3=d3.scaleLinear().domain(d3.extent(mData,d=>d.brent)).nice().range([y3Bot,y3Top]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y3).ticks(3).tickSize(-(W-m.left-m.right)).tickFormat('')).call(g=>g.select('.domain').remove());
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y3).ticks(3).tickFormat(d=>`$${d}`));
  svg.append('path').datum(mData).attr('fill',C.oil).attr('fill-opacity',.06).attr('d',d3.area().x(d=>x(d.date)).y0(y3Bot).y1(d=>y3(d.brent)).curve(d3.curveMonotoneX));
  svg.append('path').datum(mData).attr('fill','none').attr('stroke',C.oil).attr('stroke-width',2).attr('d',d3.line().x(d=>x(d.date)).y(d=>y3(d.brent)).curve(d3.curveMonotoneX));
  svg.append('text').attr('x',m.left+4).attr('y',y3Top+10).attr('font-family','Space Mono').attr('font-size',8).attr('fill',C.oil).attr('font-weight',700).text('BRENT CRUDE (USD/barrel)');

  // Event line across all panels
  svg.append('line').attr('x1',evX).attr('x2',evX).attr('y1',m.top).attr('y2',H-m.bottom).attr('stroke',C.orange).attr('stroke-width',1.5).attr('stroke-dasharray','5 5').attr('opacity',.85);
  svg.append('text').attr('x',evX+4).attr('y',m.top+9).attr('fill',C.orange).attr('font-family','Space Mono').attr('font-size',8).attr('font-weight',700).text('HORMUZ-26');

  // Hover
  const bi=d3.bisector(d=>d.date).center;
  const fo=svg.append('g').style('display','none');
  fo.append('line').attr('y1',m.top).attr('y2',H-m.bottom).attr('stroke','rgba(14,74,66,.2)').attr('stroke-dasharray','3 3');
  svg.append('rect').attr('fill','transparent').attr('x',m.left).attr('y',m.top).attr('width',W-m.left-m.right).attr('height',H-m.top-m.bottom)
    .on('mousemove',ev=>{
      const date=x.invert(d3.pointer(ev)[0]);
      const h=hData[bi(hData,date)];
      const mPt=mData[d3.bisector(d=>d.date).center(mData,date)];
      fo.style('display',null).attr('transform',`translate(${x(h.date)},0)`);
      showTip(ev,`<strong>${fmt.date(h.date)}</strong>Total: ${fmt.num(h.n_total)} ships<br>Tankers: ${fmt.num(h.n_tanker)}<br>Brent: ${mPt&&mPt.brent?fmt.usd(mPt.brent):'—'}`);
    }).on('mouseleave',()=>{ fo.style('display','none'); hideTip(); });

  d3.select('#impact-read').text('Three signals aligned to the same timeline. When HORMUZ-26 hits, transits and tankers collapse almost overnight while oil prices respond to the supply shock.');
}

/* ─── BEFORE/AFTER CH05 ───────────────────────────────────── */
function renderBeforeAfter(ba){
  const bef=ba.find(d=>d.period.startsWith('Before')), aft=ba.find(d=>d.period.startsWith('After'));
  if(!bef||!aft) return;
  const rows=[
    ['Total transits/day', bef.avg_total_transits_per_day, aft.avg_total_transits_per_day],
    ['Tankers/day', bef.avg_tankers_per_day, aft.avg_tankers_per_day],
    ['Capacity/day', bef.avg_capacity_per_day, aft.avg_capacity_per_day]
  ];
  d3.select('#before-after-grid').selectAll('.ba-card').data(rows).join('article').attr('class','ba-card').html(d=>{
    const pct=d[1]?(d[2]/d[1]-1):0;
    const fmtV=k=>d[0].includes('Capacity')?d3.format(',.2s')(k):fmt.one(k);
    return `<span class="ba-card__label">${d[0]}</span><span class="ba-card__before">${fmtV(d[1])}</span><span class="ba-card__arrow">↓</span><span class="ba-card__after">${fmtV(d[2])}</span><span class="ba-card__change">${fmt.sPct(pct)}</span>`;
  });
}
