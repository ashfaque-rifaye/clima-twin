"""Multi-resolution reference datasets for the tile engine.

Resolution hierarchy: India states → TN districts → city 500 m lattice
(data.py) → 100 m downscale (derived per tile). Coarse-band indices are
curated regional values (0..1 severity) reflecting published macro patterns
(IMD heat zones, CWC flood-prone basins, CPCB city AQI, FSI green cover);
they are placeholders for a build-time Earth Engine / BigQuery export and are
labelled `source: "curated-regional-v0"` in every tile response.
"""

# ---- Level 1 · country: state climate summaries (lat/lng = centroid) ----
INDIA_STATES: list[dict] = [
    {"name": "Tamil Nadu", "lat": 11.06, "lng": 78.39, "heat": 0.82, "flood": 0.62, "air": 0.48, "green": 0.42},
    {"name": "Kerala", "lat": 10.45, "lng": 76.41, "heat": 0.55, "flood": 0.85, "air": 0.30, "green": 0.83},
    {"name": "Karnataka", "lat": 14.72, "lng": 75.90, "heat": 0.60, "flood": 0.45, "air": 0.42, "green": 0.55},
    {"name": "Andhra Pradesh", "lat": 15.75, "lng": 79.60, "heat": 0.80, "flood": 0.66, "air": 0.45, "green": 0.38},
    {"name": "Telangana", "lat": 17.80, "lng": 79.00, "heat": 0.83, "flood": 0.42, "air": 0.52, "green": 0.34},
    {"name": "Maharashtra", "lat": 19.30, "lng": 76.20, "heat": 0.74, "flood": 0.58, "air": 0.60, "green": 0.42},
    {"name": "Goa", "lat": 15.36, "lng": 74.06, "heat": 0.45, "flood": 0.70, "air": 0.22, "green": 0.78},
    {"name": "Gujarat", "lat": 22.55, "lng": 71.60, "heat": 0.86, "flood": 0.52, "air": 0.58, "green": 0.24},
    {"name": "Rajasthan", "lat": 26.60, "lng": 73.30, "heat": 0.95, "flood": 0.18, "air": 0.62, "green": 0.12},
    {"name": "Madhya Pradesh", "lat": 23.50, "lng": 78.50, "heat": 0.78, "flood": 0.35, "air": 0.50, "green": 0.45},
    {"name": "Chhattisgarh", "lat": 21.30, "lng": 81.90, "heat": 0.72, "flood": 0.40, "air": 0.46, "green": 0.62},
    {"name": "Odisha", "lat": 20.50, "lng": 84.40, "heat": 0.76, "flood": 0.80, "air": 0.44, "green": 0.55},
    {"name": "West Bengal", "lat": 23.60, "lng": 87.85, "heat": 0.70, "flood": 0.84, "air": 0.66, "green": 0.48},
    {"name": "Bihar", "lat": 25.70, "lng": 85.60, "heat": 0.75, "flood": 0.92, "air": 0.72, "green": 0.28},
    {"name": "Jharkhand", "lat": 23.65, "lng": 85.55, "heat": 0.70, "flood": 0.38, "air": 0.58, "green": 0.50},
    {"name": "Uttar Pradesh", "lat": 26.90, "lng": 80.90, "heat": 0.82, "flood": 0.75, "air": 0.85, "green": 0.24},
    {"name": "Uttarakhand", "lat": 30.10, "lng": 79.30, "heat": 0.35, "flood": 0.72, "air": 0.35, "green": 0.80},
    {"name": "Himachal Pradesh", "lat": 31.90, "lng": 77.20, "heat": 0.22, "flood": 0.60, "air": 0.25, "green": 0.78},
    {"name": "Punjab", "lat": 30.90, "lng": 75.40, "heat": 0.72, "flood": 0.55, "air": 0.80, "green": 0.20},
    {"name": "Haryana", "lat": 29.20, "lng": 76.30, "heat": 0.78, "flood": 0.40, "air": 0.84, "green": 0.16},
    {"name": "Delhi NCT", "lat": 28.61, "lng": 77.21, "heat": 0.85, "flood": 0.45, "air": 0.97, "green": 0.15},
    {"name": "Assam", "lat": 26.20, "lng": 92.90, "heat": 0.50, "flood": 0.95, "air": 0.40, "green": 0.75},
    {"name": "Meghalaya", "lat": 25.55, "lng": 91.30, "heat": 0.25, "flood": 0.78, "air": 0.20, "green": 0.88},
    {"name": "Jammu & Kashmir", "lat": 33.80, "lng": 75.00, "heat": 0.15, "flood": 0.55, "air": 0.30, "green": 0.60},
]

# ---- Level 2 · state: Tamil Nadu district summaries ----
TN_DISTRICTS: list[dict] = [
    {"name": "Chennai", "lat": 13.08, "lng": 80.27, "heat": 0.92, "flood": 0.85, "air": 0.78, "green": 0.15},
    {"name": "Tiruvallur", "lat": 13.14, "lng": 79.91, "heat": 0.85, "flood": 0.72, "air": 0.62, "green": 0.30},
    {"name": "Chengalpattu", "lat": 12.69, "lng": 79.98, "heat": 0.82, "flood": 0.75, "air": 0.55, "green": 0.35},
    {"name": "Kancheepuram", "lat": 12.83, "lng": 79.70, "heat": 0.82, "flood": 0.60, "air": 0.52, "green": 0.34},
    {"name": "Vellore", "lat": 12.92, "lng": 79.13, "heat": 0.90, "flood": 0.35, "air": 0.55, "green": 0.28},
    {"name": "Salem", "lat": 11.66, "lng": 78.15, "heat": 0.85, "flood": 0.30, "air": 0.55, "green": 0.38},
    {"name": "Erode", "lat": 11.34, "lng": 77.72, "heat": 0.84, "flood": 0.35, "air": 0.48, "green": 0.40},
    {"name": "Coimbatore", "lat": 11.02, "lng": 76.96, "heat": 0.68, "flood": 0.38, "air": 0.52, "green": 0.55},
    {"name": "The Nilgiris", "lat": 11.42, "lng": 76.70, "heat": 0.12, "flood": 0.58, "air": 0.15, "green": 0.92},
    {"name": "Tiruchirappalli", "lat": 10.79, "lng": 78.70, "heat": 0.88, "flood": 0.48, "air": 0.50, "green": 0.30},
    {"name": "Thanjavur", "lat": 10.79, "lng": 79.14, "heat": 0.80, "flood": 0.70, "air": 0.38, "green": 0.48},
    {"name": "Cuddalore", "lat": 11.75, "lng": 79.75, "heat": 0.78, "flood": 0.88, "air": 0.60, "green": 0.35},
    {"name": "Nagapattinam", "lat": 10.77, "lng": 79.84, "heat": 0.75, "flood": 0.90, "air": 0.35, "green": 0.40},
    {"name": "Madurai", "lat": 9.93, "lng": 78.12, "heat": 0.90, "flood": 0.35, "air": 0.58, "green": 0.25},
    {"name": "Tirunelveli", "lat": 8.73, "lng": 77.70, "heat": 0.82, "flood": 0.40, "air": 0.40, "green": 0.42},
    {"name": "Thoothukudi", "lat": 8.76, "lng": 78.13, "heat": 0.85, "flood": 0.55, "air": 0.65, "green": 0.22},
    {"name": "Ramanathapuram", "lat": 9.36, "lng": 78.83, "heat": 0.84, "flood": 0.62, "air": 0.32, "green": 0.24},
    {"name": "Villupuram", "lat": 11.94, "lng": 79.49, "heat": 0.80, "flood": 0.58, "air": 0.45, "green": 0.36},
    {"name": "Dindigul", "lat": 10.36, "lng": 77.98, "heat": 0.74, "flood": 0.32, "air": 0.40, "green": 0.48},
    {"name": "Kanyakumari", "lat": 8.32, "lng": 77.45, "heat": 0.60, "flood": 0.68, "air": 0.30, "green": 0.62},
]

# ---- Level 2 · major rivers (coarse digitized courses, [lng, lat]) ----
TN_RIVERS: list[dict] = [
    {
        "name": "Kaveri",
        "path": [[75.95, 12.35], [76.60, 12.10], [77.30, 11.95], [77.80, 11.75], [78.20, 11.45],
                 [78.60, 11.15], [78.95, 10.95], [79.30, 10.85], [79.65, 10.85], [79.85, 10.95]],
    },
    {
        "name": "Palar",
        "path": [[78.30, 13.10], [78.75, 12.95], [79.15, 12.85], [79.55, 12.75], [79.90, 12.60], [80.15, 12.47]],
    },
    {
        "name": "Vaigai",
        "path": [[77.45, 10.15], [77.80, 10.05], [78.10, 9.95], [78.45, 9.75], [78.80, 9.55], [79.05, 9.40]],
    },
    {
        "name": "Thamirabarani",
        "path": [[77.30, 8.75], [77.60, 8.70], [77.85, 8.68], [78.10, 8.63]],
    },
]

# ---- Level 4 · real Chennai assets (appear z≥13) ----
CHENNAI_ASSETS: list[dict] = [
    {"name": "CMBT Koyambedu", "kind": "transit", "lat": 13.0694, "lng": 80.1948},
    {"name": "Chennai Central", "kind": "transit", "lat": 13.0827, "lng": 80.2757},
    {"name": "Egmore Station", "kind": "transit", "lat": 13.0732, "lng": 80.2609},
    {"name": "Tambaram Station", "kind": "transit", "lat": 12.9249, "lng": 80.1000},
    {"name": "T. Nagar Bus Terminus", "kind": "transit", "lat": 13.0418, "lng": 80.2341},
    {"name": "Broadway Terminus", "kind": "transit", "lat": 13.0888, "lng": 80.2868},
    {"name": "Rajiv Gandhi Govt Hospital", "kind": "hospital", "lat": 13.0810, "lng": 80.2760},
    {"name": "Apollo Greams Road", "kind": "hospital", "lat": 13.0623, "lng": 80.2530},
    {"name": "Govt Royapettah Hospital", "kind": "hospital", "lat": 13.0540, "lng": 80.2648},
    {"name": "Stanley Medical College", "kind": "hospital", "lat": 13.1078, "lng": 80.2860},
    {"name": "Presidency College", "kind": "school", "lat": 13.0555, "lng": 80.2809},
    {"name": "Anna University", "kind": "school", "lat": 13.0110, "lng": 80.2354},
    {"name": "Loyola College", "kind": "school", "lat": 13.0629, "lng": 80.2343},
    {"name": "IIT Madras", "kind": "school", "lat": 12.9915, "lng": 80.2337},
    {"name": "Koyambedu Market", "kind": "market", "lat": 13.0713, "lng": 80.1919},
    {"name": "Marina Beach Promenade", "kind": "public", "lat": 13.0500, "lng": 80.2824},
]
