# Hormuz Under Pressure

Interactive D3/Leaflet website using real public data only: IMF PortWatch, FRED/EIA, and official EIA context.

## Run locally

```powershell
cd hormuz-under-pressure-real
py -m http.server 8000
```

Open: http://localhost:8000

## Source data used

- `dataset.zip/portwatch/Daily_Chokepoints_Data.csv` → `data/processed/hormuz_daily.csv`, `chokepoints_daily.csv`, `chokepoints_summary.csv`, `hormuz_before_after.csv`
- `dataset.zip/portwatch/Portwatch_Disruptions_Database.csv` → `data/processed/hormuz_events.csv`
- `dataset.zip/brent_crude/DCOILBRENTEU.csv` → `data/processed/market_prices.csv`
- `dataset.zip/jet_fuel/DJFUELUSGULF.csv` → `data/processed/market_prices.csv`
- U.S. EIA Today in Energy article → context facts only, cited in the website.

No Kaggle or synthetic datasets are used.
