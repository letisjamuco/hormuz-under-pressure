# Hormuz Under Pressure | [Official Website](https://letisjamuco.github.io/hormuz-under-pressure/)

An interactive data-story website about the Strait of Hormuz and how maritime chokepoint risk connects to tanker traffic, oil benchmarks, and fuel prices in Greece.

## What the project shows

1. Where the Strait of Hormuz is and why it matters as a narrow maritime gate.
2. How Hormuz compares with other global chokepoints using tanker traffic metrics.
3. How vessel traffic through Hormuz changed around the HORMUZ-26 disruption marker.
4. Which origin countries and destination markets are connected to Hormuz oil flows.
5. How global benchmark prices and Greek fuel prices moved downstream.
6. Which Greek prefectures pay more for fuel, with interactive map and ranking views.

## How to run

This is a static website. Run it from a local server so the CSV files and map pages load correctly:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```


## Project proposal

The final project proposal is included in:

```text
docs/Hormuz_Under_Pressure_Project_Proposal.pdf
```

The website also includes a "Project proposal" button that opens the PDF in a modal viewer.

## Main files

- `index.html` - page structure and story chapters
- `styles.css` - layout and visual styling
- `script.js` - D3 charts and page interactions
- `map-hormuz.html` - Strait of Hormuz map
- `map-world.html` - global chokepoint comparison map
- `map-flow.html` - Hormuz oil-flow map
- `map-greece.html` - Greek prefecture fuel-price map
- `data/processed/` - cleaned CSV datasets used by the website

## Data sources

- IMF PortWatch, chokepoint transit calls and disruption data
- U.S. Energy Information Administration (EIA), Today in Energy, Strait of Hormuz context and flow data
- Vortexa tanker tracking, cited by EIA for Hormuz origin and destination flows
- FRED / U.S. EIA, Brent crude and U.S. Gulf Coast jet fuel benchmark series
- fuelprices.gr / Hellenic Ministry of Development, Greek fuel-price data
- click_that_hood / Code for Germany, Greece prefecture GeoJSON
- OpenStreetMap, map tiles for the Leaflet maps

## Notes

The website uses cleaned and processed datasets derived from the sources above. Flow arcs are simplified geographic representations and should not be interpreted as AIS vessel trajectories.
