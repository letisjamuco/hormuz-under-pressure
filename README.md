# From Hormuz to the Boarding Gate

> An interactive data visualization tracing how disruptions around the Strait of Hormuz propagate from oil markets to airline ticket prices.

[Live website](#) · [Explainer video](#) · [Project proposal](docs/proposal.pdf)

A geopolitical event 4,000 km away. An oil price spike measured in days. A ticket price you pay in months. This project visualises that chain.

## About

This is the source code for a group project for the **M126 Data Visualization** course at the National and Kapodistrian University of Athens (NKUA), Spring 2026, supervised by Maria Roussou.

The website hosts six linked dashboard chapters that walk a non-specialist audience through the path of a Hormuz-related shock, from chokepoint maps to oil and jet fuel time-series, airline pricing responses, passenger ticket breakdowns, route disruption maps, and a stress dashboard tying everything together. The dashboards are built in Tableau Public and embedded as iframes. One custom narrative component is built directly in D3.js.

## Team

- **Letisja Muco**, web design, D3 component, video editing — `lmuco@di.uoa.gr`
- **Eirini Katrantzi**, data preparation, oil and fuel chapters (CH·01, CH·02) — `katreir@di.uoa.gr`
- **Alexandra Kaliakouda**, airline response and passenger ticket chapters (CH·03, CH·04) — `kaliak@di.uoa.gr`

## Repository structure

```
.
├── index.html         # Landing page, structure of all six chapters
├── styles.css         # All styles (boarding-pass aesthetic, sky palette)
├── script.js          # Scroll-driven plane indicator, reveal-on-scroll
├── d3/                # CH·05 route disruption map (D3.js)
├── data/              # Cleaned CSV files used by the D3 component
├── docs/              # Project proposal and supporting documents
└── assets/            # Images, fonts, video poster
```

## Running locally

The site is plain HTML, CSS, and JavaScript with no build step. Clone the repository and open `index.html` in a modern browser, or serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The Tableau dashboards are loaded via Tableau Public iframe embeds, so they require an active internet connection. The D3 component runs entirely client-side from local CSV files.

## Data

The primary dataset is **Airline Ticket Prices vs Oil and Fuel Costs** by Z. K. S. Khurram on Kaggle, a research-grade synthetic dataset calibrated to real-world benchmarks. The website also references real-world data from EIA, IEA, FRED (Brent and jet fuel), OPEC, OurAirports, ACLED, U.S. BTS, Eurocontrol, and the World Bank. Full data source list and links are on the credits page of the website.

The Kaggle dataset is **scenario-based, not factual history**. We use it to illustrate propagation patterns, not to make causal claims about specific historical events.

## Tools

- **Tableau Public** for chapters 1, 2, 3, 4, and 6
- **D3.js** for chapter 5 (route disruption map)
- **HTML, CSS, vanilla JavaScript** for the website

## License

Source code is released under the MIT License. The Kaggle dataset retains its original license. Real-world datasets remain the property of their respective publishers (EIA, FRED, OPEC, IEA, OurAirports, ACLED, BTS, Eurocontrol, World Bank).

## Acknowledgements

Course staff for guidance throughout the semester. The `Inside Airbnb` and `Five Design-Sheet` methodologies as inspiration for our design process. The dataset author Z. K. S. Khurram for compiling the Kaggle scenario tables that form the backbone of our analysis.

## CH·05 v8 notes

The D3 route component is now embedded in `index.html` via:

```html
<iframe src="d3/route-map.html" class="d3-embed-frame"></iframe>
```

The component uses:

- Leaflet + OpenStreetMap for the basemap
- D3 for route aggregation, arcs, ranking table, filters, fuel-context chart, tooltips and linked selection
- `d3/data/routes.csv` from the cleaned Kaggle route-cost table
- `d3/data/city-coordinates.csv` for origin/destination positions
- `d3/data/monthly-fuel.csv` derived from cleaned FRED Brent and Jet Fuel data

Run the website through a local server, not by double-clicking the HTML file, because browsers may block CSV loading from `file://`.

Example:

```bash
cd website
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```
