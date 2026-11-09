# Country catalog and geometry sources

Catalog reviewed on 2026-11-08; microstate geometries verified on 2026-11-09. All resources are bundled; normal builds do not download data.

## Coverage: 200 countries in every phase

- 193 [UN member states](https://www.un.org/en/about-us/member-states).
- The two [UN observer states](https://www.un.org/en/about-us/non-member-states): Holy See (displayed as Vatican City) and Palestine.
- Western Sahara, Kosovo and Taiwan as separate quiz entries.
- [Cook Islands](https://www.mfat.govt.nz/en/countries-and-regions/australia-and-pacific/cook-islands) and [Niue](https://www.mfat.govt.nz/en/countries-and-regions/australia-and-pacific/niue), self-governing states in free association.

Dependent territories are not separate targets in this catalog. All 200 entries participate equally in all four phases, including the formerly excluded countries. Ten distinct countries are selected per phase; countries may recur across phases or games.

## Country records

Base source: [DataHub country-codes](https://github.com/datasets/country-codes/blob/main/data/country-codes.csv), [PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/), retrieved 2026-11-08. Source CSV SHA-256: `bb199ebc9636b9872705e8216f1f849359f136a7668ebfa23a3c58048462ab92`.

Selected rows: `is_independent=Yes`, plus PS, EH, CK and NU. Kosovo is added explicitly with code XK, alpha3 XKX and application geometry ID XKX (not an ISO numeric assignment). This yields 200 entries. Names are expanded where abbreviations obscure the country. The checked-in JSON is the authoritative curated catalog; regeneration of maps does not re-import or change it.

Capital conventions avoid suppressing countries with multiple capitals or a separate government seat:

| Country | Quiz answer and wording | Reference |
| --- | --- | --- |
| Switzerland | Bern, federal city | [Swiss government](https://www.aboutswitzerland.eda.admin.ch/en/political-system) |
| Malaysia | Kuala Lumpur, official capital | [Ministry of Foreign Affairs](https://www.kln.gov.my/web/fin_helsinki/post/federal-territory-day) |
| South Africa | Pretoria, administrative capital | [South African government](https://www.gov.za/about-sa/south-africas-provinces) |
| Eswatini | Mbabane, administrative capital | [African Union](https://au.int/en/cities/lobambaroyal-and-legislative-mbabane-administrative) |
| Sri Lanka | Sri Jayewardenepura Kotte, legislative capital | [Parliament](https://www.parliament.lk/en/home/parliament-news/view/2548) |
| Nauru | Yaren, district serving as seat of government | [Australian Government fact files](https://www.dfat.gov.au/sites/default/files/our-indo-pacific-community-3-4-country-fact-files.pdf) |
| Bolivia | Sucre, constitutional capital | Base country-codes record; prompt distinguishes the government seat in La Paz |
| Netherlands | Amsterdam, constitutional capital | Base country-codes record; prompt distinguishes the government seat in The Hague |
| Palestine | East Jerusalem, declared capital | [Palestinian Ministry of Foreign Affairs](https://www.mofa.pna.ps/en-us/mediaoffice/our-position) |
| Western Sahara | Laayoune, claimed capital | [Capital convention](https://www.defactoborders.org/places/western-sahara); kept distinct from Morocco in all phases |
| Equatorial Guinea | Ciudad de la Paz | [Government proclamation, January 2026](https://www.guineaecuatorialpress.com/index.php/noticias/el_presidente_de_la_republica_proclama_la_ciudad_de_la_paz_como_capital_de_la_republica_de_guinea_ecuatorial_con_la_firma_de_un_decreto_ley) |
| Palau | Ngerulmud | [Palau government](https://55piflm.gov.pw/about) |
| Kiribati | South Tarawa | [Kiribati Tourism Authority](https://kiribatitourism.gov.ki/land-and-public-transport/) |
| Kazakhstan | Astana | Existing corrected catalog entry; replaces the old Nur-Sultan CSV value |
| Indonesia | Jakarta | [Jakarta government, 2026](https://m.beritajakarta.id/en/read/152669/pramono-jakarta-remains-the-capital-city-until-a-presidential-decree-is-issued) |

## Geometries and flags

- world-atlas 2.0.2, Natural Earth 4.1.0, for the base 1:50m quiz map and 1:110m decorative globe.
- [Natural Earth 5.1.2 at 1:10m](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_0_countries.geojson) for 37 small-country supplements. Selected countries have source spherical area below 0.00025 steradians, plus missing Tuvalu. Only their geometries and identifiers are bundled. The supplement replaces the lower-resolution feature in both builds. For Monaco and Vatican City, the overly generalized Natural Earth features are superseded by the specific boundaries below.
- Kosovo is identified by source name and assigned XKX. Multiple records with the same numeric code are combined, preserving Australia's island components.
- Morocco and Western Sahara source geometries are combined and repartitioned at 27°40′ N, removing the provider's internal control line. Reference: [UN Western Sahara map](https://www.un.org/geospatial/sites/www.un.org.geospatial/files/files/documents/2023/Sep/western_sahara_3175_r4_oct12_120.pdf).
- flag-icons 7.3.2 provides all 200 flags, including EH and XK. SVG identifiers are sanitized without changing pixels.
- No islands are dropped from source geometries. Dispersed silhouettes include an enlarged detail and a full-country overview. Location geometry retains six decimal places to preserve microstates and atolls.

`npm run data:build` regenerates flags, silhouettes, the location map and the globe offline. Missing country resources fail the build. Regression tests enumerate the complete 200-code catalog, generate every country in every phase, validate playable interiors and retained islands, and preserve the Morocco/Western Sahara separation.

## Precise microstate boundaries and map database license

- Vatican City: [geoBoundaries VAT-ADM0-52476719](https://www.geoboundaries.org/api/current/gbOpen/VAT/ADM0/), source geoBoundaries/Wikimedia Commons, public domain. Geometry pinned to [9469f09](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/VAT/ADM0/geoBoundaries-VAT-ADM0.geojson). Represented area is approximately 0.51 km²; the generalized Natural Earth 10m shape was only approximately 0.01 km² and is not used.
- Monaco: [geoBoundaries MCO-ADM0-9783051](https://www.geoboundaries.org/api/current/gbOpen/MCO/ADM0/), © OpenStreetMap contributors, via Wambacher/geoBoundaries, [ODbL 1.0](https://www.openstreetmap.org/copyright). Geometry pinned to [9469f09](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/MCO/ADM0/geoBoundaries-MCO-ADM0.geojson). Represented area is approximately 2.03 km² rather than the generalized Natural Earth shape's approximately 18.8 km². Both microstate source geometries represent 2017 boundaries.

The supplemented geometry database (`geometry-supplements.json`) and its derived location map (`location-map.json`) are made available under ODbL 1.0, with the full license in `licenses/odbl.txt`. This does not change the license of application code or the separately maintained public-domain country-name/capital catalog. The app visibly credits the map sources, links the license and provides the complete derived map at `/map-data.geojson`. Polygon winding is normalized for D3; the location build rounds coordinates to six decimals without reducing vertices.

The Vatican boundary is also cut out of Italy's base geometry so the same point cannot score for both countries.
