// Route definitions for seed data — real waypoints, snapped to real streets via OSRM.
import * as fs from "fs";

export interface RouteDef {
  id: string;
  city: string;
  country: string;
  waypoints: [number, number][]; // [lng, lat]
  eleBase: number;
  eleRange: number; // total gentle variation
  hills?: number; // big climb component (m over route)
  kinds: string[]; // sports that use it
  loop: boolean;
}

export const ROUTES: RouteDef[] = [
  {
    id: "hatirjheel",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3988,23.7575],[90.4040,23.7545],[90.4100,23.7565],[90.4145,23.7610],[90.4130,23.7665],[90.4070,23.7685],[90.4005,23.7645],[90.3965,23.7595],[90.3988,23.7575]],
    eleBase: 7, eleRange: 6, kinds: ["ride","run","walk"], loop: true,
  },
  {
    id: "gulshan_lake",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.4075,23.7875],[90.4095,23.7920],[90.4130,23.7975],[90.4100,23.8020],[90.4045,23.8015],[90.4025,23.7965],[90.4040,23.7900],[90.4075,23.7875]],
    eleBase: 8, eleRange: 5, kinds: ["run","walk"], loop: true,
  },
  {
    id: "dhanmondi",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3725,23.7440],[90.3765,23.7465],[90.3795,23.7490],[90.3785,23.7515],[90.3755,23.7525],[90.3725,23.7500],[90.3705,23.7470],[90.3725,23.7440]],
    eleBase: 8, eleRange: 4, kinds: ["run","walk"], loop: true,
  },
  {
    id: "ramna",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3975,23.7355],[90.3995,23.7375],[90.4005,23.7395],[90.3985,23.7410],[90.3965,23.7385],[90.3975,23.7355]],
    eleBase: 9, eleRange: 3, kinds: ["run","walk"], loop: true,
  },
  {
    id: "uttara",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3965,23.8725],[90.3995,23.8760],[90.4030,23.8785],[90.4010,23.8825],[90.3965,23.8810],[90.3935,23.8770],[90.3965,23.8725]],
    eleBase: 12, eleRange: 5, kinds: ["run","walk","ride"], loop: true,
  },
  {
    id: "airport",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3805,23.7850],[90.3815,23.8000],[90.3825,23.8200],[90.3835,23.8450],[90.3845,23.8650]],
    eleBase: 10, eleRange: 6, kinds: ["ride"], loop: false,
  },
  {
    id: "bashundhara",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.4240,23.8105],[90.4290,23.8180],[90.4345,23.8260],[90.4420,23.8380],[90.4370,23.8450],[90.4290,23.8380],[90.4230,23.8250],[90.4185,23.8150],[90.4240,23.8105]],
    eleBase: 11, eleRange: 6, kinds: ["ride"], loop: true,
  },
  {
    id: "gazipur",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3845,23.8650],[90.3900,23.9050],[90.3960,23.9500],[90.4010,23.9950],[90.4070,24.0400],[90.4120,24.0750]],
    eleBase: 14, eleRange: 10, kinds: ["ride"], loop: false,
  },
  {
    id: "chandrima",
    city: "Dhaka", country: "Bangladesh",
    waypoints: [[90.3935,23.7940],[90.3960,23.7965],[90.3950,23.7990],[90.3920,23.7975],[90.3935,23.7940]],
    eleBase: 9, eleRange: 3, kinds: ["run","walk"], loop: true,
  },
  {
    id: "berlin",
    city: "Berlin", country: "Germany",
    waypoints: [[13.3500,52.5140],[13.3560,52.5165],[13.3620,52.5180],[13.3595,52.5215],[13.3525,52.5200],[13.3480,52.5160],[13.3500,52.5140]],
    eleBase: 36, eleRange: 6, kinds: ["run","ride"], loop: true,
  },
  {
    id: "london",
    city: "London", country: "United Kingdom",
    waypoints: [[-0.1455,51.5255],[-0.1400,51.5285],[-0.1370,51.5325],[-0.1435,51.5345],[-0.1505,51.5315],[-0.1455,51.5255]],
    eleBase: 24, eleRange: 5, kinds: ["run","ride"], loop: true,
  },
  {
    id: "sydney",
    city: "Sydney", country: "Australia",
    waypoints: [[151.2295,-33.8990],[151.2360,-33.9035],[151.2335,-33.9085],[151.2250,-33.9060],[151.2235,-33.9010],[151.2295,-33.8990]],
    eleBase: 62, eleRange: 12, kinds: ["run","ride"], loop: true,
  },
  {
    id: "singapore",
    city: "Singapore", country: "Singapore",
    waypoints: [[103.8540,1.2865],[103.8600,1.2875],[103.8625,1.2930],[103.8575,1.2955],[103.8530,1.2920],[103.8540,1.2865]],
    eleBase: 8, eleRange: 4, kinds: ["run"], loop: true,
  },
  {
    id: "tokyo",
    city: "Tokyo", country: "Japan",
    waypoints: [[139.7495,35.6845],[139.7540,35.6865],[139.7565,35.6900],[139.7525,35.6930],[139.7475,35.6900],[139.7485,35.6855],[139.7495,35.6845]],
    eleBase: 28, eleRange: 5, kinds: ["run","ride"], loop: true,
  },
  {
    id: "boulder",
    city: "Boulder", country: "United States",
    waypoints: [[-105.2750,40.0150],[-105.2850,40.0185],[-105.2950,40.0230],[-105.2870,40.0285],[-105.2790,40.0245],[-105.2750,40.0150]],
    eleBase: 1650, eleRange: 20, hills: 240, kinds: ["run","trail_run","hike"], loop: true,
  },
  {
    id: "boston",
    city: "Boston", country: "United States",
    waypoints: [[-71.0650,42.3620],[-71.0730,42.3670],[-71.0850,42.3700],[-71.0920,42.3640],[-71.0800,42.3590],[-71.0650,42.3620]],
    eleBase: 12, eleRange: 6, kinds: ["run","ride"], loop: true,
  },
];

const CACHE_FILE = __dirname + "/routes-cache.json";

export async function fetchRouteGeometries(): Promise<Record<string, [number, number][]>> {
  if (fs.existsSync(CACHE_FILE)) {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  }
  const out: Record<string, [number, number][]> = {};
  for (const r of ROUTES) {
    const coordStr = r.waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "stride-seed/1.0" } });
        const json = await res.json() as any;
        if (json.code === "Ok" && json.routes?.[0]?.geometry?.coordinates) {
          out[r.id] = json.routes[0].geometry.coordinates;
          console.log(`route ${r.id}: ${json.routes[0].distance.toFixed(0)}m, ${out[r.id].length} pts`);
          break;
        } else {
          console.log(`route ${r.id} failed: ${json.code ?? "no route"}`);
        }
      } catch (e) {
        console.log(`route ${r.id} error attempt ${attempt + 1}`);
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(out));
  return out;
}
