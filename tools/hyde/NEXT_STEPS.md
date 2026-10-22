# HYDE population extraction - resume notes (run 3 state)

STATUS: extraction pipeline WORKING end-to-end. Fixed x mapping bug: game x = floor((lonC+180)/0.28125) (map spans lon -180..180, NOT 0..360). All previously extracted pop_*.b64 BEFORE extract6.js were discarded and re-extraction is in progress.

DONE with fixed mapping (pop_<Y>.b64, Float64Array[2048] indexed by prov id, total=world pop kept in provinces):
- 10000BC (4.38M), 3000BC (44.0M), 1000BC (109.5M), 0AD (230.0M)
Sanity vs HYDE published world totals: good.

REMAINING YEARS (run `./cycle.sh <YEAR>` from /tmp/era; scripts run_<Y>.js ready):
100AD 600AD 1000AD 1200AD 1300AD 1400AD 1500AD 1600AD 1700AD 1810AD 1820AD 1910AD 1940AD 1950AD
Each takes ~40s: launch background job, sleep 40, collect handle, saves pop_<Y>.b64.
NOTE diag fields: result JSON also has totalAll (global parse sum) and dropCoast (cells on no-province pixels); verify dropCoast/totalAll is small (<5%) per year before using.

THEN:
1. python: decode b64 -> per-prov pop arrays; era years: -10000=10000BC, -3000=3000BC, -500=interp(1000BC,0AD), -323=interp(1000BC,0AD), 100=100AD, 600=600AD, 1000=1000AD, 1279=interp(1200,1300), 1492=interp(1400,1500), 1650=interp(1600,1700), 1815=interp(1810,1820), 1914=1910, 1945=interp(1940,1950). Linear in year (BC years as negative; no year 0 - use astronomical year numbering: 1000BC=-999, 0AD=0).
2. Per era: pop of country i = sum of acc[prov] over provs with owner==i. Write into data/era/<year>.json countries[].pop (round to int). Unassigned (-1) provinces keep no country; that's fine.
3. Sanity-check per era: sum of country pops ~= world total; spot-check headline polities (Rome 100AD, Mongol 1279, Ming 1500, British Empire 1914) vs historical estimates; disclose HYDE uncertainty in README.
4. Re-run test/era.mjs + test/smoke.mjs.
5. Korean names extension, visual checks (Korean-capable fonts!), license finalization per main's guidance (GPL source-offer concretely satisfied: era data derived from GPL GeoJSON -> ship LICENSE-data-gpl3.txt + attribution + make derived data available in repo = source available; HYDE license discrepancy vault readme CC BY 4.0 vs Yoda page CC BY-NC-SA 4.0 stays OPEN - hold redistribution decision for main/user if unresolved).
6. Deploy via cloud browser vault login "GitHub sigco3111"; keep v15 rollback; live desktop+mobile screenshots.

Browser: lease id in /tmp/era/lease_id (expires ~08:50 KST). Tab 1 parked at vault original/ dir. Guidance recorded.
