const STATUS_COLOR = {
  Normal: '#6693C0',
  Rerouted: '#C09366',
  Cancelled: '#B54A3A',
};

const STATUS_ORDER = { Normal: 0, Rerouted: 1, Cancelled: 2 };
const PERIODS = {
  before: ['Pre-Iran Escalation'],
  during: ['US-Iran War Conflict'],
  both: ['Pre-Iran Escalation', 'US-Iran War Conflict'],
};
const PERIOD_WINDOWS = {
  before: [new Date('2024-12-01'), new Date('2025-11-30')],
  during: [new Date('2025-12-01'), new Date('2026-03-31')],
  both: [new Date('2024-12-01'), new Date('2026-03-31')],
};
const PERIOD_LABELS = {
  before: 'Before shock',
  during: 'During shock',
  both: 'Before + during',
};

const fmt = d3.format(',');
const money = d3.format(',.0f');
const shortMoney = d => {
  if (!Number.isFinite(d)) return '$0';
  if (Math.abs(d) >= 1e6) return `$${d3.format('.2s')(d).replace('G','B')}`;
  return `$${money(d)}`;
};

const state = {
  rows: [],
  fuelRows: [],
  cityLookup: new Map(),
  visibleRoutes: [],
  selectedKey: null,
  map: null,
  svg: null,
  svgLayer: null,
  routeLayer: null,
  hitLayer: null,
  cityLayer: null,
  labelLayer: null,
};

initMap();

Promise.all([
  d3.csv('data/routes.csv', parseRoute),
  d3.csv('data/city-coordinates.csv', d => ({ city: d.city, lng: +d.lng, lat: +d.lat })),
  d3.csv('data/monthly-fuel.csv', parseFuel),
]).then(([routes, cities, fuels]) => {
  state.rows = routes.filter(d => PERIODS.both.includes(d.conflict_phase));
  state.cityLookup = new Map(cities.map(d => [d.city, { lat: d.lat, lng: d.lng }]));
  state.fuelRows = fuels;

  buildFilters();
  bindEvents();
  buildLegend();
  renderFuelChart();
  render(true);
}).catch(error => {
  console.error(error);
  d3.select('#map-empty')
    .classed('hidden', false)
    .text('Could not load the route data. Check the browser console.');
});

function parseRoute(row) {
  const rerouted = String(row.rerouted || '').trim();
  const cancelled = String(row.flight_cancelled || '').trim();
  return {
    ...row,
    monthDate: new Date(row.month),
    status: cancelled === 'Yes' ? 'Cancelled' : (rerouted === 'Yes' ? 'Rerouted' : 'Normal'),
    original_distance_km: +row.original_distance_km || 0,
    actual_distance_km: +row.actual_distance_km || 0,
    extra_distance_km: +row.extra_distance_km || 0,
    extra_fuel_cost_usd: +row.extra_fuel_cost_usd || 0,
    estimated_passengers: +row.estimated_passengers || 0,
    fuel_surcharge_usd: +row.fuel_surcharge_usd || 0,
    total_ticket_price_usd: +row.total_ticket_price_usd || 0,
    route_revenue_usd: +row.route_revenue_usd || 0,
    brent_crude_usd: +row.brent_crude_usd || 0,
    jet_fuel_usd_barrel: +row.jet_fuel_usd_barrel || 0,
  };
}

function parseFuel(row) {
  return {
    month: new Date(row.month),
    brent: +row.brent_usd_barrel,
    jet: +row.jet_fuel_usd_gallon,
    brentIndex: +row.brent_index_2019_01,
    jetIndex: +row.jet_index_2019_01,
  };
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 14,
    scrollWheelZoom: true,
  }).setView([20, 54], 3);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(state.map);

  L.svg({ padding: 0.8 }).addTo(state.map);
  state.svg = d3.select(state.map.getPanes().overlayPane).select('svg').attr('class', 'leaflet-d3-overlay');
  state.svgLayer = state.svg.select('g').attr('class', 'leaflet-d3-layer');
  state.routeLayer = state.svgLayer.append('g').attr('class', 'routes-layer');
  state.hitLayer = state.svgLayer.append('g').attr('class', 'hits-layer');
  state.cityLayer = state.svgLayer.append('g').attr('class', 'cities-layer');
  state.labelLayer = state.svgLayer.append('g').attr('class', 'labels-layer');

  state.map.on('move zoom viewreset', redrawMapLayers);
}

function buildFilters() {
  const citySet = new Set();
  state.rows.forEach(d => { citySet.add(d.origin_city); citySet.add(d.destination_city); });
  const hubSel = document.getElementById('hub-filter');
  [...citySet].sort((a, b) => a.localeCompare(b)).forEach(city => {
    hubSel.appendChild(new Option(city, city));
  });

  const airlineSel = document.getElementById('airline-filter');
  [...new Set(state.rows.map(d => d.airline))].sort((a, b) => a.localeCompare(b)).forEach(airline => {
    airlineSel.appendChild(new Option(airline, airline));
  });
}

function bindEvents() {
  ['period-filter', 'status-filter', 'hub-filter', 'airline-filter', 'topn-filter'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      state.selectedKey = null;
      render(true);
    });
  });

  document.getElementById('reset-all').addEventListener('click', () => {
    document.getElementById('period-filter').value = 'during';
    document.getElementById('status-filter').value = 'impacted';
    document.getElementById('hub-filter').value = 'all';
    document.getElementById('airline-filter').value = 'all';
    document.getElementById('topn-filter').value = '10';
    state.selectedKey = null;
    state.map.flyTo([20, 54], 3, { duration: 0.6 });
    render(true);
  });

  document.getElementById('clear-selection').addEventListener('click', () => {
    state.selectedKey = null;
    render(false);
  });
}

function render(animate = false) {
  const rawRows = getFilteredRows();
  const aggregated = aggregateRoutes(rawRows)
    .sort((a, b) => d3.descending(a.cost, b.cost) || d3.descending(STATUS_ORDER[a.status], STATUS_ORDER[b.status]));

  const topN = +document.getElementById('topn-filter').value;
  state.visibleRoutes = topN > 0 ? aggregated.slice(0, topN) : aggregated;

  if (state.selectedKey && !state.visibleRoutes.some(d => routeKey(d) === state.selectedKey)) {
    state.selectedKey = null;
  }

  renderStats(rawRows, aggregated);
  renderFuelChart();
  renderRouteList();
  renderDetail();
  drawMapLayers(animate);
  d3.select('#map-empty').classed('hidden', state.visibleRoutes.length > 0).text(emptyMessage());
  document.getElementById('clear-selection').classList.toggle('hidden', !state.selectedKey);
}

function getFilteredRows() {
  const period = document.getElementById('period-filter').value;
  const status = document.getElementById('status-filter').value;
  const hub = document.getElementById('hub-filter').value;
  const airline = document.getElementById('airline-filter').value;
  const phases = PERIODS[period] || PERIODS.during;

  return state.rows.filter(row => {
    if (!phases.includes(row.conflict_phase)) return false;
    if (status === 'impacted' && row.status === 'Normal') return false;
    if (status !== 'impacted' && status !== 'all' && row.status !== status) return false;
    if (hub !== 'all' && row.origin_city !== hub && row.destination_city !== hub) return false;
    if (airline !== 'all' && row.airline !== airline) return false;
    return true;
  });
}

function emptyMessage() {
  const airline = document.getElementById('airline-filter').value;
  const status = document.getElementById('status-filter').value;
  const period = document.getElementById('period-filter').value;
  if (period === 'before' && status === 'impacted') {
    return 'No impacted routes in the before-shock window. Switch Status to “All statuses” or “Normal only” to see baseline routes.';
  }
  if (airline !== 'all' && status === 'impacted') {
    return `${airline} has no impacted routes for this filter. Try “All statuses” to see normal routes.`;
  }
  return 'No routes match these filters.';
}

function aggregateRoutes(rows) {
  const grouped = d3.rollup(rows, values => {
    const counts = d3.rollup(values, v => v.length, d => d.status);
    const status = values.some(d => d.status === 'Cancelled') ? 'Cancelled' : (values.some(d => d.status === 'Rerouted') ? 'Rerouted' : 'Normal');
    const pax = d3.sum(values, d => d.estimated_passengers);
    return {
      status,
      rows: values,
      routeMonths: values.length,
      cost: d3.sum(values, d => d.extra_fuel_cost_usd),
      extraKm: d3.sum(values, d => d.extra_distance_km),
      pax,
      revenue: d3.sum(values, d => d.route_revenue_usd),
      avgTicket: weightedMean(values, d => d.total_ticket_price_usd, d => d.estimated_passengers),
      avgSurcharge: weightedMean(values, d => d.fuel_surcharge_usd, d => d.estimated_passengers),
      airlines: [...new Set(values.map(d => d.airline))].sort(),
      aircraft: [...new Set(values.map(d => d.aircraft_type))].sort(),
      cancelled: counts.get('Cancelled') || 0,
      rerouted: counts.get('Rerouted') || 0,
      normal: counts.get('Normal') || 0,
    };
  }, d => d.origin_city, d => d.destination_city);

  const routes = [];
  grouped.forEach((destMap, origin) => {
    destMap.forEach((metrics, destination) => {
      const originCoords = state.cityLookup.get(origin);
      const destCoords = state.cityLookup.get(destination);
      if (!originCoords || !destCoords) return;
      routes.push({ origin, destination, originCoords, destCoords, ...metrics });
    });
  });
  return routes;
}

function weightedMean(values, valueAccessor, weightAccessor) {
  const totalWeight = d3.sum(values, weightAccessor);
  if (!totalWeight) return d3.mean(values, valueAccessor) || 0;
  return d3.sum(values, d => valueAccessor(d) * weightAccessor(d)) / totalWeight;
}

function renderStats(rawRows, aggregatedRoutes) {
  const cancelled = rawRows.filter(d => d.status === 'Cancelled').length;
  const rerouted = rawRows.filter(d => d.status === 'Rerouted').length;
  const extraCost = d3.sum(rawRows, d => d.extra_fuel_cost_usd);
  const extraKm = d3.sum(rawRows, d => d.extra_distance_km);
  const avgTicket = weightedMean(rawRows, d => d.total_ticket_price_usd, d => d.estimated_passengers);
  const avgSurcharge = weightedMean(rawRows, d => d.fuel_surcharge_usd, d => d.estimated_passengers);

  d3.select('#stats-bar').html(`
    <div class="stat-card"><span class="stat-label">Visible O-D routes</span><span class="stat-value">${fmt(aggregatedRoutes.length)}</span><span class="stat-note">before top-N cut</span></div>
    <div class="stat-card"><span class="stat-label">Route-month records</span><span class="stat-value">${fmt(rawRows.length)}</span><span class="stat-note">C ${fmt(cancelled)} · R ${fmt(rerouted)}</span></div>
    <div class="stat-card"><span class="stat-label">Estimated impact</span><span class="stat-value">${shortMoney(extraCost)}</span><span class="stat-note">extra fuel cost</span></div>
    <div class="stat-card"><span class="stat-label">Extra distance</span><span class="stat-value">${fmt(Math.round(extraKm))} km</span><span class="stat-note">selected records</span></div>
    <div class="stat-card"><span class="stat-label">Avg ticket / surcharge</span><span class="stat-value">$${money(avgTicket)} / $${money(avgSurcharge)}</span><span class="stat-note">passenger-weighted</span></div>
  `);
}

function renderFuelChart() {
  if (!state.fuelRows.length) return;

  const svg = d3.select('#fuel-chart');
  const width = 880;
  const height = 72;
  const margin = { top: 6, right: 74, bottom: 18, left: 34 };
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  svg.selectAll('*').remove();

  const period = document.getElementById('period-filter') ? document.getElementById('period-filter').value : 'during';
  const [startDate, endDate] = PERIOD_WINDOWS[period];
  const visibleFuel = state.fuelRows.filter(d => d.month >= startDate && d.month <= endDate);
  const rows = visibleFuel.length >= 2 ? visibleFuel : state.fuelRows;

  const x = d3.scaleTime()
    .domain(d3.extent(rows, d => d.month))
    .range([margin.left, width - margin.right]);

  const first = rows[0];
  const relRows = rows.map(d => ({
    ...d,
    brentRel: first?.brentIndex ? (d.brentIndex / first.brentIndex) * 100 : d.brentIndex,
    jetRel: first?.jetIndex ? (d.jetIndex / first.jetIndex) * 100 : d.jetIndex,
  }));
  const values = relRows.flatMap(d => [d.brentRel, d.jetRel]).filter(Number.isFinite);
  const minY = Math.max(0, d3.min(values) * 0.96);
  const maxY = d3.max(values) * 1.04;
  const y = d3.scaleLinear().domain([minY, maxY]).nice().range([height - margin.bottom, margin.top]);

  svg.append('rect')
    .attr('class', 'fuel-highlight')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', width - margin.left - margin.right)
    .attr('height', height - margin.top - margin.bottom);

  svg.append('g')
    .attr('class', 'fuel-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(Math.min(5, rows.length)).tickSizeOuter(0));

  svg.append('g')
    .attr('class', 'fuel-axis')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(3).tickFormat(d => `${Math.round(d)}`));

  const brentLine = d3.line().x(d => x(d.month)).y(d => y(d.brentRel));
  const jetLine = d3.line().x(d => x(d.month)).y(d => y(d.jetRel));

  svg.append('path').datum(relRows).attr('class', 'fuel-line brent').attr('d', brentLine);
  svg.append('path').datum(relRows).attr('class', 'fuel-line jet').attr('d', jetLine);

  const last = relRows[relRows.length - 1];
  const pct = value => value ? value - 100 : 0;
  svg.append('text')
    .attr('class', 'fuel-label')
    .attr('x', width - margin.right + 8)
    .attr('y', y(last.brentRel))
    .text(`Brent ${d3.format('+,.0f')(pct(last.brentRel))}%`);
  svg.append('text')
    .attr('class', 'fuel-label')
    .attr('x', width - margin.right + 8)
    .attr('y', y(last.jetRel))
    .text(`Jet ${d3.format('+,.0f')(pct(last.jetRel))}%`);
  svg.append('text')
    .attr('class', 'fuel-label')
    .attr('x', margin.left + 6)
    .attr('y', margin.top + 12)
    .text(PERIOD_LABELS[period]);
}

function drawMapLayers(animate = false) {
  const maxCost = d3.max(state.visibleRoutes, d => d.cost) || 1;
  const strokeScale = d3.scaleSqrt().domain([0, maxCost]).range([1.2, 6.2]);
  const selected = state.selectedKey;

  const routes = state.routeLayer.selectAll('path.route').data(state.visibleRoutes, routeKey);
  routes.exit().transition().duration(150).style('opacity', 0).remove();

  const entered = routes.enter().append('path')
    .attr('class', 'route')
    .style('opacity', 0)
    .on('mouseenter', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip)
    .on('click', (event, route) => selectRoute(route, true));

  const merged = entered.merge(routes)
    .attr('class', d => routeClass(d, selected))
    .attr('stroke', d => STATUS_COLOR[d.status])
    .attr('stroke-width', d => d.status === 'Normal' ? 0.9 : strokeScale(d.cost));

  if (animate) {
    merged.transition().delay((d, i) => i * 18).duration(250).style('opacity', d => routeOpacity(d, selected));
  } else {
    merged.style('opacity', d => routeOpacity(d, selected));
  }

  const hits = state.hitLayer.selectAll('path.route-hit').data(state.visibleRoutes, routeKey);
  hits.exit().remove();
  hits.enter().append('path')
    .attr('class', 'route-hit')
    .on('mouseenter', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip)
    .on('click', (event, route) => selectRoute(route, true))
    .merge(hits)
    .attr('stroke-width', d => Math.max(12, strokeScale(d.cost) + 8));

  drawCities();
  redrawMapLayers();
}

function drawCities() {
  const cityMap = new Map();
  state.visibleRoutes.forEach(route => {
    addCity(route.origin, routeKey(route) === state.selectedKey);
    addCity(route.destination, routeKey(route) === state.selectedKey);
  });

  function addCity(name, selected) {
    const coords = state.cityLookup.get(name);
    if (!coords) return;
    if (!cityMap.has(name)) cityMap.set(name, { name, coords, count: 0, selected: false });
    const city = cityMap.get(name);
    city.count += 1;
    city.selected = city.selected || selected;
  }

  const cities = [...cityMap.values()].sort((a, b) => d3.descending(a.count, b.count));

  const dots = state.cityLayer.selectAll('circle.city-dot').data(cities, d => d.name);
  dots.exit().remove();
  dots.enter().append('circle').attr('class', 'city-dot')
    .merge(dots)
    .attr('r', d => d.selected ? 6.5 : Math.min(5.2, 3 + Math.sqrt(d.count) * 0.45))
    .attr('class', d => `city-dot${d.selected ? '' : ' is-secondary'}`);

  const labels = state.labelLayer.selectAll('text.city-label').data(cities, d => d.name);
  labels.exit().remove();
  labels.enter().append('text').attr('class', 'city-label')
    .merge(labels)
    .text(d => d.name);
}

function redrawMapLayers() {
  if (!state.map || !state.visibleRoutes) return;
  state.routeLayer.selectAll('path.route').attr('d', routePath);
  state.hitLayer.selectAll('path.route-hit').attr('d', routePath);

  const labelNames = visibleLabelSet();
  state.cityLayer.selectAll('circle.city-dot')
    .attr('cx', d => project(d.coords).x)
    .attr('cy', d => project(d.coords).y);
  state.labelLayer.selectAll('text.city-label')
    .attr('x', d => project(d.coords).x + labelOffset(d.name)[0])
    .attr('y', d => project(d.coords).y + labelOffset(d.name)[1])
    .classed('hidden-label', d => !labelNames.has(d.name));
}

function routePath(route) {
  const p1 = project(route.originCoords);
  const p2 = project(route.destCoords);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curve = -Math.min(140, Math.max(30, dist * 0.20));
  const angle = Math.atan2(dy, dx) - Math.PI / 2;
  const cx = mx + Math.cos(angle) * curve;
  const cy = my + Math.sin(angle) * curve;
  return `M${p1.x},${p1.y} Q${cx},${cy} ${p2.x},${p2.y}`;
}

function project(coords) {
  return state.map.latLngToLayerPoint([coords.lat, coords.lng]);
}

function visibleLabelSet() {
  const names = new Set();
  const selected = state.visibleRoutes.find(d => routeKey(d) === state.selectedKey);
  if (selected) {
    names.add(selected.origin);
    names.add(selected.destination);
  }
  const zoom = state.map.getZoom();
  const topCities = new Set();
  state.visibleRoutes.slice(0, zoom >= 5 ? 20 : 10).forEach(route => {
    topCities.add(route.origin);
    topCities.add(route.destination);
  });
  topCities.forEach(name => names.add(name));
  return names;
}

function labelOffset(name) {
  const special = {
    Doha: [9, -9], Dubai: [9, 4], 'Abu Dhabi': [9, 17], Muscat: [9, 16],
    London: [9, -6], 'New York': [9, -6], Riyadh: [9, 16], Bahrain: [9, -8],
    'Kuwait City': [9, -8], Sharjah: [9, -10],
  };
  return special[name] || [9, -7];
}

function routeClass(route, selected) {
  const classes = ['route', `is-${route.status.toLowerCase()}`];
  if (routeKey(route) === selected) classes.push('is-selected');
  else if (selected) classes.push('is-muted');
  return classes.join(' ');
}

function routeOpacity(route, selected) {
  if (selected && routeKey(route) !== selected) return route.status === 'Normal' ? 0.04 : 0.12;
  if (route.status === 'Normal') return 0.32;
  if (route.status === 'Rerouted') return 0.62;
  return 0.78;
}

function renderRouteList() {
  const selected = state.selectedKey;
  const rows = state.visibleRoutes;
  if (!rows.length) {
    d3.select('#route-list').html('<div class="empty-list">No matching routes.</div>');
    return;
  }

  d3.select('#route-list').html(`
    <table class="route-table">
      <thead><tr><th>#</th><th>Route</th><th>Status</th><th>Impact</th></tr></thead>
      <tbody>
      ${rows.map((route, i) => `
        <tr data-key="${escapeHtml(routeKey(route))}" class="${routeKey(route) === selected ? 'is-selected' : ''}">
          <td><span class="rank-pill">${i + 1}</span></td>
          <td>
            <div class="route-name">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</div>
            <div class="submeta">${escapeHtml(route.airlines.join(', '))} · ${fmt(route.routeMonths)} route-months</div>
          </td>
          <td><span class="status-chip" style="background:${STATUS_COLOR[route.status]}">${escapeHtml(route.status)}</span></td>
          <td>${shortMoney(route.cost)}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>
  `);

  d3.selectAll('#route-list tbody tr').on('click', function() {
    const key = this.getAttribute('data-key');
    const route = state.visibleRoutes.find(d => routeKey(d) === key);
    if (route) selectRoute(route, true);
  });
}

function renderDetail() {
  const panel = d3.select('#detail-panel');
  const route = state.visibleRoutes.find(d => routeKey(d) === state.selectedKey);
  if (!route) {
    panel.classed('hidden', true);
    return;
  }
  panel.classed('hidden', false).html(`
    <div class="detail-grid">
      <div class="detail-title">
        <strong>${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</strong>
        <span>${escapeHtml(route.airlines.join(', '))} · ${escapeHtml(route.aircraft.slice(0, 2).join(', '))}</span>
      </div>
      ${metric('Status', route.status)}
      ${metric('Impact', shortMoney(route.cost))}
      ${metric('Extra distance', `${fmt(Math.round(route.extraKm))} km`)}
      ${metric('Avg ticket', `$${money(route.avgTicket)}`)}
      ${metric('Fuel surcharge', `$${money(route.avgSurcharge)}`)}
      ${metric('C · R · N', `${route.cancelled} · ${route.rerouted} · ${route.normal}`)}
    </div>
  `);
}

function metric(label, value) {
  return `<div class="detail-metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function selectRoute(route, zoom = false) {
  state.selectedKey = routeKey(route);
  render(false);
  if (zoom) {
    const bounds = L.latLngBounds(
      [route.originCoords.lat, route.originCoords.lng],
      [route.destCoords.lat, route.destCoords.lng]
    );
    state.map.fitBounds(bounds.pad(0.25), { maxZoom: 10, animate: true });
  }
}

function showTooltip(event, route) {
  d3.select('#tooltip').classed('hidden', false).html(`
    <div class="tooltip-route">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</div>
    <div class="tooltip-row"><span>Status</span><strong>${escapeHtml(route.status)}</strong></div>
    <div class="tooltip-row"><span>Impact</span><strong>${shortMoney(route.cost)}</strong></div>
    <div class="tooltip-row"><span>Extra km</span><strong>${fmt(Math.round(route.extraKm))}</strong></div>
    <div class="tooltip-row"><span>Avg ticket</span><strong>$${money(route.avgTicket)}</strong></div>
  `);
  moveTooltip(event);
}

function moveTooltip(event) {
  d3.select('#tooltip')
    .style('left', `${event.pageX + 12}px`)
    .style('top', `${event.pageY - 10}px`);
}
function hideTooltip() { d3.select('#tooltip').classed('hidden', true); }

function buildLegend() {
  d3.select('#legend').html(`
    <span class="legend-item"><span class="legend-swatch" style="background:${STATUS_COLOR.Cancelled}"></span>Cancelled</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${STATUS_COLOR.Rerouted}"></span>Rerouted</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${STATUS_COLOR.Normal}; border-top:2px dashed ${STATUS_COLOR.Normal}; height:0"></span>Normal</span>
    <span class="impact-scale"><i class="thin"></i>lower impact <i class="thick"></i>higher impact</span>
  `);
}

function routeKey(route) { return `${route.origin}|${route.destination}`; }
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
