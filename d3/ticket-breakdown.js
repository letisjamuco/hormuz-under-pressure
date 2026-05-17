const DATA_URL = "data/ticket-prices.csv";

const PERIODS = {
  before: {
    label: "Before shock",
    sub: "Jun–Nov 2025",
    start: new Date("2025-06-01"),
    end: new Date("2025-11-01")
  },
  during: {
    label: "During shock",
    sub: "Dec 2025–Mar 2026",
    start: new Date("2025-12-01"),
    end: new Date("2026-03-01")
  }
};

const components = [
  { key: "base_fare_usd", label: "Base fare", color: "#16345f", short: "Base" },
  { key: "fuel_surcharge_usd", label: "Fuel surcharge", color: "#d65a2e", short: "Fuel" },
  { key: "taxes_fees_usd", label: "Taxes & fees", color: "#7f93a8", short: "Taxes" }
];

const formatUSD = d3.format("$,.0f");
const formatPct = d3.format("+.0%");
const formatSignedUSD = value => `${value >= 0 ? "+" : "−"}${formatUSD(Math.abs(value))}`;
const parseDate = d3.timeParse("%Y-%m-%d");

let rows = [];
let state = {
  airline: "All airlines",
  region: "All regions",
  routeClass: "All route classes"
};

const els = {
  airline: d3.select("#airline-filter"),
  region: d3.select("#region-filter"),
  routeClass: d3.select("#class-filter"),
  reset: d3.select("#reset-filters"),
  svg: d3.select("#ticket-chart"),
  legend: d3.select("#component-legend"),
  context: d3.select("#selected-context"),
  totalChange: d3.select("#total-change"),
  totalChangePct: d3.select("#total-change-pct"),
  fuelChange: d3.select("#fuel-change"),
  fuelChangePct: d3.select("#fuel-change-pct"),
  baseDelta: d3.select("#base-delta"),
  taxDelta: d3.select("#tax-delta"),
  recordsUsed: d3.select("#records-used")
};

d3.csv(DATA_URL, d => ({
  month: parseDate(d.month),
  conflict_phase: d.conflict_phase,
  airline: d.airline,
  region: d.region,
  route_class: d.route_class,
  base_fare_usd: +d.base_fare_usd,
  fuel_surcharge_usd: +d.fuel_surcharge_usd,
  taxes_fees_usd: +d.taxes_fees_usd,
  total_fare_usd: +d.total_fare_usd,
  brent_crude_usd: +d.brent_crude_usd,
  jet_fuel_usd_barrel: +d.jet_fuel_usd_barrel
})).then(data => {
  rows = data.filter(d => d.month && Number.isFinite(d.total_fare_usd));
  initFilters();
  drawLegend();
  update();
});

function initFilters() {
  setOptions(els.airline, ["All airlines", ...sortNames(unique(rows, d => d.airline))], state.airline);
  setOptions(els.region, ["All regions", ...sortNames(unique(rows, d => d.region))], state.region);
  setOptions(els.routeClass, ["All route classes", ...sortNames(unique(rows, d => d.route_class))], state.routeClass);

  els.airline.on("change", event => { state.airline = event.target.value; update(); });
  els.region.on("change", event => { state.region = event.target.value; update(); });
  els.routeClass.on("change", event => { state.routeClass = event.target.value; update(); });
  els.reset.on("click", () => {
    state = { airline: "All airlines", region: "All regions", routeClass: "All route classes" };
    els.airline.property("value", state.airline);
    els.region.property("value", state.region);
    els.routeClass.property("value", state.routeClass);
    update();
  });
}

function unique(data, accessor) {
  return Array.from(new Set(data.map(accessor).filter(Boolean)));
}

function sortNames(values) {
  return values.sort((a, b) => d3.ascending(a, b));
}

function setOptions(select, values, selected) {
  select.selectAll("option")
    .data(values)
    .join("option")
    .attr("value", d => d)
    .text(d => d)
    .property("selected", d => d === selected);
}

function drawLegend() {
  const items = els.legend.selectAll(".legend-item")
    .data(components)
    .join("span")
    .attr("class", "legend-item");

  items.append("span")
    .attr("class", "swatch")
    .style("background", d => d.color);

  items.append("span")
    .text(d => d.label);
}

function filteredRows() {
  return rows.filter(d =>
    (state.airline === "All airlines" || d.airline === state.airline) &&
    (state.region === "All regions" || d.region === state.region) &&
    (state.routeClass === "All route classes" || d.route_class === state.routeClass)
  );
}

function inPeriod(d, period) {
  return d.month >= period.start && d.month <= period.end;
}

function aggregate(data, period) {
  const periodRows = data.filter(d => inPeriod(d, period));
  const avg = key => d3.mean(periodRows, d => d[key]) ?? 0;

  return {
    label: period.label,
    sub: period.sub,
    rows: periodRows.length,
    base_fare_usd: avg("base_fare_usd"),
    fuel_surcharge_usd: avg("fuel_surcharge_usd"),
    taxes_fees_usd: avg("taxes_fees_usd"),
    total_fare_usd: avg("total_fare_usd"),
    jet_fuel_usd_barrel: avg("jet_fuel_usd_barrel"),
    brent_crude_usd: avg("brent_crude_usd")
  };
}

function update() {
  const data = filteredRows();
  const before = aggregate(data, PERIODS.before);
  const during = aggregate(data, PERIODS.during);

  const context = [
    state.airline === "All airlines" ? "all airlines" : state.airline,
    state.region === "All regions" ? "all regions" : state.region,
    state.routeClass === "All route classes" ? "all route classes" : state.routeClass
  ].join(" · ");
  els.context.text(context);

  updateNumbers(before, during);
  drawChart([before, during]);
}

function updateNumbers(before, during) {
  const totalDelta = during.total_fare_usd - before.total_fare_usd;
  const fuelDelta = during.fuel_surcharge_usd - before.fuel_surcharge_usd;
  const baseDelta = during.base_fare_usd - before.base_fare_usd;
  const taxDelta = during.taxes_fees_usd - before.taxes_fees_usd;

  els.totalChange.text(formatSignedUSD(totalDelta));
  els.totalChangePct.text(before.total_fare_usd ? `${formatPct(totalDelta / before.total_fare_usd)} vs baseline` : "—");

  els.fuelChange.text(formatSignedUSD(fuelDelta));
  els.fuelChangePct.text(before.fuel_surcharge_usd ? `${formatPct(fuelDelta / before.fuel_surcharge_usd)} vs baseline` : "—");

  els.baseDelta.text(formatSignedUSD(baseDelta));
  els.taxDelta.text(formatSignedUSD(taxDelta));
  els.recordsUsed.text(`${before.rows + during.rows}`);
}

function drawChart(periodData) {
  const svg = els.svg;
  const node = svg.node();
  const width = node.clientWidth || 820;
  const height = node.clientHeight || 280;

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll("*").remove();

  if (!periodData.every(d => d.rows > 0)) {
    svg.append("text")
      .attr("class", "empty-state")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .text("No ticket records match these filters for the selected comparison window.");
    return;
  }

  const margin = { top: 28, right: 110, bottom: 42, left: 145 };
  const innerW = width - margin.left - margin.right;
  const barH = 44;

  const totals = periodData.map(d => d.total_fare_usd);
  const x = d3.scaleLinear()
    .domain([0, d3.max(totals) * 1.12])
    .range([margin.left, margin.left + innerW])
    .nice();

  const y = d3.scaleBand()
    .domain(periodData.map(d => d.label))
    .range([70, 190])
    .padding(0.38);

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `$${d3.format(",")(d)}`));

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", height - 6)
    .attr("fill", "#6b86a6")
    .attr("font-family", "Space Mono, monospace")
    .attr("font-size", 10)
    .text("Average ticket price (USD)");

  periodData.forEach(period => {
    let x0 = x(0);
    const y0 = y(period.label);
    const values = components.map(c => ({ ...c, value: period[c.key] }));

    svg.append("text")
      .attr("class", "period-label")
      .attr("x", 0)
      .attr("y", y0 + 21)
      .text(period.label);

    svg.append("text")
      .attr("class", "period-sub")
      .attr("x", 0)
      .attr("y", y0 + 41)
      .text(period.sub);

    svg.selectAll(`rect.${cssSafe(period.label)}`)
      .data(values)
      .join("rect")
      .attr("x", x0)
      .attr("y", y0)
      .attr("height", y.bandwidth())
      .attr("rx", 7)
      .attr("ry", 7)
      .attr("fill", d => d.color)
      .attr("width", 0)
      .transition()
      .duration(650)
      .ease(d3.easeCubicOut)
      .attr("x", d => {
        const start = x0;
        x0 += x(d.value) - x(0);
        return start;
      })
      .attr("width", d => Math.max(1, x(d.value) - x(0)));

    // Recompute positions for labels.
    let labelX = x(0);
    values.forEach(d => {
      const w = x(d.value) - x(0);
      if (w > 54) {
        svg.append("text")
          .attr("class", "bar-label")
          .attr("x", labelX + w / 2)
          .attr("y", y0 + y.bandwidth() / 2 + 4)
          .attr("text-anchor", "middle")
          .attr("fill", d.key === "fuel_surcharge_usd" ? "#ffffff" : "#ffffff")
          .style("opacity", 0)
          .text(`${d.short} ${formatUSD(d.value)}`)
          .transition()
          .delay(350)
          .duration(300)
          .style("opacity", 1);
      }
      labelX += w;
    });

    svg.append("text")
      .attr("class", "total-label")
      .attr("x", x(period.total_fare_usd) + 10)
      .attr("y", y0 + y.bandwidth() / 2 + 4)
      .text(formatUSD(period.total_fare_usd));
  });

  const before = periodData[0];
  const during = periodData[1];
  const fuelShareBefore = before.fuel_surcharge_usd / before.total_fare_usd;
  const fuelShareDuring = during.fuel_surcharge_usd / during.total_fare_usd;

  svg.append("path")
    .attr("d", `M ${x(before.total_fare_usd)} ${y(before.label) + y.bandwidth() + 8}
                C ${x(before.total_fare_usd) + 45} 160,
                  ${x(during.total_fare_usd) - 45} 110,
                  ${x(during.total_fare_usd)} ${y(during.label) - 8}`)
    .attr("fill", "none")
    .attr("stroke", "#d65a2e")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5 5")
    .attr("opacity", 0.75);

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 24)
    .attr("fill", "#d65a2e")
    .attr("font-family", "Space Mono, monospace")
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .text(`Fuel surcharge share: ${d3.format(".0%")(fuelShareBefore)} → ${d3.format(".0%")(fuelShareDuring)}`);
}

function cssSafe(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

window.addEventListener("resize", () => update());
