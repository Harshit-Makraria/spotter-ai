"""
A small offline gazetteer of US cities on or near the interstate network.

Used as the last-resort label for a stop so that the "Remarks" column of a log
sheet is never blank, even with no network access or API quota. 49 CFR 395.8(c)
asks for the nearest city, town or village and the state abbreviation, which is
exactly the granularity stored here.
"""

from __future__ import annotations

import math

#: (name, state, latitude, longitude)
CITIES: tuple[tuple[str, str, float, float], ...] = (
    ("Birmingham", "AL", 33.5186, -86.8104), ("Mobile", "AL", 30.6954, -88.0399),
    ("Montgomery", "AL", 32.3668, -86.3000), ("Huntsville", "AL", 34.7304, -86.5861),
    ("Anchorage", "AK", 61.2181, -149.9003),
    ("Phoenix", "AZ", 33.4484, -112.0740), ("Tucson", "AZ", 32.2226, -110.9747),
    ("Flagstaff", "AZ", 35.1983, -111.6513), ("Yuma", "AZ", 32.6927, -114.6277),
    ("Little Rock", "AR", 34.7465, -92.2896), ("Fort Smith", "AR", 35.3859, -94.3985),
    ("Los Angeles", "CA", 34.0522, -118.2437), ("San Diego", "CA", 32.7157, -117.1611),
    ("San Jose", "CA", 37.3382, -121.8863), ("San Francisco", "CA", 37.7749, -122.4194),
    ("Fresno", "CA", 36.7378, -119.7871), ("Sacramento", "CA", 38.5816, -121.4944),
    ("Bakersfield", "CA", 35.3733, -119.0187), ("Barstow", "CA", 34.8958, -117.0173),
    ("Redding", "CA", 40.5865, -122.3917), ("Stockton", "CA", 37.9577, -121.2908),
    ("Denver", "CO", 39.7392, -104.9903), ("Colorado Springs", "CO", 38.8339, -104.8214),
    ("Grand Junction", "CO", 39.0639, -108.5506), ("Pueblo", "CO", 38.2544, -104.6091),
    ("Hartford", "CT", 41.7658, -72.6734), ("Bridgeport", "CT", 41.1792, -73.1894),
    ("Wilmington", "DE", 39.7391, -75.5398),
    ("Washington", "DC", 38.9072, -77.0369),
    ("Jacksonville", "FL", 30.3322, -81.6557), ("Miami", "FL", 25.7617, -80.1918),
    ("Tampa", "FL", 27.9506, -82.4572), ("Orlando", "FL", 28.5383, -81.3792),
    ("Tallahassee", "FL", 30.4383, -84.2807), ("Fort Myers", "FL", 26.6406, -81.8723),
    ("Atlanta", "GA", 33.7490, -84.3880), ("Savannah", "GA", 32.0809, -81.0912),
    ("Macon", "GA", 32.8407, -83.6324), ("Columbus", "GA", 32.4610, -84.9877),
    ("Honolulu", "HI", 21.3069, -157.8583),
    ("Boise", "ID", 43.6150, -116.2023), ("Idaho Falls", "ID", 43.4917, -112.0339),
    ("Chicago", "IL", 41.8781, -87.6298), ("Springfield", "IL", 39.7817, -89.6501),
    ("Peoria", "IL", 40.6936, -89.5890), ("Rockford", "IL", 42.2711, -89.0940),
    ("Effingham", "IL", 39.1200, -88.5434),
    ("Indianapolis", "IN", 39.7684, -86.1581), ("Fort Wayne", "IN", 41.0793, -85.1394),
    ("Evansville", "IN", 37.9716, -87.5711), ("Gary", "IN", 41.5934, -87.3464),
    ("Des Moines", "IA", 41.5868, -93.6250), ("Davenport", "IA", 41.5236, -90.5776),
    ("Council Bluffs", "IA", 41.2619, -95.8608),
    ("Wichita", "KS", 37.6872, -97.3301), ("Topeka", "KS", 39.0473, -95.6752),
    ("Salina", "KS", 38.8403, -97.6114), ("Goodland", "KS", 39.3506, -101.7102),
    ("Louisville", "KY", 38.2527, -85.7585), ("Lexington", "KY", 38.0406, -84.5037),
    ("Bowling Green", "KY", 36.9685, -86.4808),
    ("New Orleans", "LA", 29.9511, -90.0715), ("Baton Rouge", "LA", 30.4515, -91.1871),
    ("Shreveport", "LA", 32.5252, -93.7502), ("Lafayette", "LA", 30.2241, -92.0198),
    ("Portland", "ME", 43.6591, -70.2568), ("Bangor", "ME", 44.8016, -68.7712),
    ("Baltimore", "MD", 39.2904, -76.6122), ("Hagerstown", "MD", 39.6418, -77.7200),
    ("Boston", "MA", 42.3601, -71.0589), ("Springfield", "MA", 42.1015, -72.5898),
    ("Detroit", "MI", 42.3314, -83.0458), ("Grand Rapids", "MI", 42.9634, -85.6681),
    ("Lansing", "MI", 42.7325, -84.5555), ("Saginaw", "MI", 43.4195, -83.9508),
    ("Minneapolis", "MN", 44.9778, -93.2650), ("Duluth", "MN", 46.7867, -92.1005),
    ("Rochester", "MN", 44.0121, -92.4802),
    ("Jackson", "MS", 32.2988, -90.1848), ("Meridian", "MS", 32.3643, -88.7034),
    ("Kansas City", "MO", 39.0997, -94.5786), ("St. Louis", "MO", 38.6270, -90.1994),
    ("Springfield", "MO", 37.2090, -93.2923), ("Columbia", "MO", 38.9517, -92.3341),
    ("Billings", "MT", 45.7833, -108.5007), ("Missoula", "MT", 46.8721, -113.9940),
    ("Great Falls", "MT", 47.5053, -111.3008),
    ("Omaha", "NE", 41.2565, -95.9345), ("Lincoln", "NE", 40.8136, -96.7026),
    ("North Platte", "NE", 41.1239, -100.7654),
    ("Las Vegas", "NV", 36.1699, -115.1398), ("Reno", "NV", 39.5296, -119.8138),
    ("Elko", "NV", 40.8324, -115.7631), ("Winnemucca", "NV", 40.9730, -117.7357),
    ("Manchester", "NH", 42.9956, -71.4548),
    ("Newark", "NJ", 40.7357, -74.1724), ("Cherry Hill", "NJ", 39.9348, -75.0307),
    ("Atlantic City", "NJ", 39.3643, -74.4229),
    ("Albuquerque", "NM", 35.0844, -106.6504), ("Las Cruces", "NM", 32.3199, -106.7637),
    ("Gallup", "NM", 35.5281, -108.7426), ("Tucumcari", "NM", 35.1717, -103.7250),
    ("New York", "NY", 40.7128, -74.0060), ("Buffalo", "NY", 42.8864, -78.8784),
    ("Albany", "NY", 42.6526, -73.7562), ("Syracuse", "NY", 43.0481, -76.1474),
    ("Binghamton", "NY", 42.0987, -75.9180),
    ("Charlotte", "NC", 35.2271, -80.8431), ("Raleigh", "NC", 35.7796, -78.6382),
    ("Greensboro", "NC", 36.0726, -79.7920), ("Asheville", "NC", 35.5951, -82.5515),
    ("Fargo", "ND", 46.8772, -96.7898), ("Bismarck", "ND", 46.8083, -100.7837),
    ("Columbus", "OH", 39.9612, -82.9988), ("Cleveland", "OH", 41.4993, -81.6944),
    ("Cincinnati", "OH", 39.1031, -84.5120), ("Toledo", "OH", 41.6528, -83.5379),
    ("Dayton", "OH", 39.7589, -84.1916), ("Akron", "OH", 41.0814, -81.5190),
    ("Oklahoma City", "OK", 35.4676, -97.5164), ("Tulsa", "OK", 36.1540, -95.9928),
    ("Portland", "OR", 45.5152, -122.6784), ("Eugene", "OR", 44.0521, -123.0868),
    ("Bend", "OR", 44.0582, -121.3153), ("Medford", "OR", 42.3265, -122.8756),
    ("Philadelphia", "PA", 39.9526, -75.1652), ("Pittsburgh", "PA", 40.4406, -79.9959),
    ("Harrisburg", "PA", 40.2732, -76.8867), ("Allentown", "PA", 40.6084, -75.4902),
    ("Scranton", "PA", 41.4090, -75.6624),
    ("Providence", "RI", 41.8240, -71.4128),
    ("Columbia", "SC", 34.0007, -81.0348), ("Charleston", "SC", 32.7765, -79.9311),
    ("Greenville", "SC", 34.8526, -82.3940),
    ("Sioux Falls", "SD", 43.5460, -96.7313), ("Rapid City", "SD", 44.0805, -103.2310),
    ("Nashville", "TN", 36.1627, -86.7816), ("Memphis", "TN", 35.1495, -90.0490),
    ("Knoxville", "TN", 35.9606, -83.9207), ("Chattanooga", "TN", 35.0456, -85.3097),
    ("Houston", "TX", 29.7604, -95.3698), ("San Antonio", "TX", 29.4241, -98.4936),
    ("Dallas", "TX", 32.7767, -96.7970), ("Austin", "TX", 30.2672, -97.7431),
    ("Fort Worth", "TX", 32.7555, -97.3308), ("El Paso", "TX", 31.7619, -106.4850),
    ("Amarillo", "TX", 35.2220, -101.8313), ("Lubbock", "TX", 33.5779, -101.8552),
    ("Odessa", "TX", 31.8457, -102.3676), ("Texarkana", "TX", 33.4251, -94.0477),
    ("Salt Lake City", "UT", 40.7608, -111.8910), ("St. George", "UT", 37.0965, -113.5684),
    ("Provo", "UT", 40.2338, -111.6585), ("Green River", "UT", 38.9955, -110.1593),
    ("Burlington", "VT", 44.4759, -73.2121),
    ("Virginia Beach", "VA", 36.8529, -75.9780), ("Richmond", "VA", 37.5407, -77.4360),
    ("Roanoke", "VA", 37.2710, -79.9414), ("Fredericksburg", "VA", 38.3032, -77.4605),
    ("Bristol", "VA", 36.5951, -82.1887),
    ("Seattle", "WA", 47.6062, -122.3321), ("Spokane", "WA", 47.6588, -117.4260),
    ("Tacoma", "WA", 47.2529, -122.4443), ("Yakima", "WA", 46.6021, -120.5059),
    ("Charleston", "WV", 38.3498, -81.6326), ("Morgantown", "WV", 39.6295, -79.9559),
    ("Milwaukee", "WI", 43.0389, -87.9065), ("Madison", "WI", 43.0731, -89.4012),
    ("Eau Claire", "WI", 44.8113, -91.4985), ("Green Bay", "WI", 44.5133, -88.0133),
    ("Cheyenne", "WY", 41.1400, -104.8202), ("Casper", "WY", 42.8666, -106.3131),
    ("Rock Springs", "WY", 41.5875, -109.2029), ("Sheridan", "WY", 44.7972, -106.9562),
)

_EARTH_RADIUS_MILES = 3958.7613


def nearest_city(lat: float, lon: float) -> str:
    """Return 'City, ST' for the closest known city, with a distance hint."""
    best_name, best_state, best_distance = "", "", float("inf")

    phi1 = math.radians(lat)
    cos_phi1 = math.cos(phi1)

    for name, state, city_lat, city_lon in CITIES:
        phi2 = math.radians(city_lat)
        d_phi = phi2 - phi1
        d_lambda = math.radians(city_lon - lon)
        a = (
            math.sin(d_phi / 2) ** 2
            + cos_phi1 * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        )
        distance = 2 * _EARTH_RADIUS_MILES * math.asin(math.sqrt(a))
        if distance < best_distance:
            best_name, best_state, best_distance = name, state, distance

    if not best_name:
        return f"{lat:.2f}, {lon:.2f}"
    if best_distance <= 12:
        return f"{best_name}, {best_state}"
    # 395.8(c) allows naming the nearest town when the stop is not in one.
    return f"near {best_name}, {best_state}"
