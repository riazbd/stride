// Sport catalog — mirrors Strava's activity types
export interface SportDef {
  id: string;
  label: string;
  group: "run" | "ride" | "swim" | "water" | "snow" | "workout" | "court" | "walk";
  icon: string; // lucide icon name
  met: number; // metabolic equivalent for calorie estimation
  paceMode: "pace" | "speed" | "time"; // how performance is displayed
  color: string;
  defaultMoving: boolean; // distance-based sports
}

export const SPORTS: SportDef[] = [
  { id: "run", label: "Run", group: "run", icon: "Footprints", met: 9.8, paceMode: "pace", color: "#fc4c02", defaultMoving: true },
  { id: "trail_run", label: "Trail Run", group: "run", icon: "Mountain", met: 10.5, paceMode: "pace", color: "#fc4c02", defaultMoving: true },
  { id: "walk", label: "Walk", group: "walk", icon: "PersonStanding", met: 3.5, paceMode: "pace", color: "#8a6d3b", defaultMoving: true },
  { id: "hike", label: "Hike", group: "walk", icon: "Mountain", met: 6.0, paceMode: "pace", color: "#8a6d3b", defaultMoving: true },
  { id: "ride", label: "Ride", group: "ride", icon: "Bike", met: 6.8, paceMode: "speed", color: "#242427", defaultMoving: true },
  { id: "gravel", label: "Gravel Ride", group: "ride", icon: "Bike", met: 7.2, paceMode: "speed", color: "#7a5c3e", defaultMoving: true },
  { id: "mtb", label: "Mountain Bike Ride", group: "ride", icon: "Mountain", met: 8.0, paceMode: "speed", color: "#5c4a2e", defaultMoving: true },
  { id: "ebike", label: "E-Bike Ride", group: "ride", icon: "Zap", met: 4.0, paceMode: "speed", color: "#4a8f5c", defaultMoving: true },
  { id: "virtual_ride", label: "Virtual Ride", group: "ride", icon: "MonitorPlay", met: 6.5, paceMode: "speed", color: "#5d5d66", defaultMoving: false },
  { id: "swim", label: "Swim", group: "swim", icon: "Waves", met: 8.3, paceMode: "pace", color: "#2c7f8f", defaultMoving: true },
  { id: "open_water", label: "Open Water Swim", group: "swim", icon: "Waves", met: 8.6, paceMode: "pace", color: "#2c7f8f", defaultMoving: true },
  { id: "row", label: "Rowing", group: "water", icon: "Sailboat", met: 7.0, paceMode: "speed", color: "#3a6b8a", defaultMoving: true },
  { id: "kayak", label: "Kayak", group: "water", icon: "Sailboat", met: 6.0, paceMode: "speed", color: "#3a6b8a", defaultMoving: true },
  { id: "ski", label: "Ski", group: "snow", icon: "Snowflake", met: 7.0, paceMode: "speed", color: "#3e7ca6", defaultMoving: true },
  { id: "snowboard", label: "Snowboard", group: "snow", icon: "Snowflake", met: 6.5, paceMode: "speed", color: "#3e7ca6", defaultMoving: true },
  { id: "ice_skate", label: "Ice Skate", group: "snow", icon: "Snowflake", met: 5.5, paceMode: "speed", color: "#3e7ca6", defaultMoving: true },
  { id: "workout", label: "Workout", group: "workout", icon: "Activity", met: 5.0, paceMode: "time", color: "#5d5d66", defaultMoving: false },
  { id: "gym", label: "Weight Training", group: "workout", icon: "Dumbbell", met: 6.0, paceMode: "time", color: "#5d5d66", defaultMoving: false },
  { id: "yoga", label: "Yoga", group: "workout", icon: "Flower2", met: 3.0, paceMode: "time", color: "#8a5d7a", defaultMoving: false },
  { id: "hiit", label: "HIIT", group: "workout", icon: "Zap", met: 8.0, paceMode: "time", color: "#b8452c", defaultMoving: false },
  { id: "tennis", label: "Tennis", group: "court", icon: "CircleDot", met: 7.3, paceMode: "time", color: "#6d8a3a", defaultMoving: false },
  { id: "football", label: "Soccer", group: "court", icon: "Trophy", met: 7.0, paceMode: "time", color: "#3a8a5c", defaultMoving: false },
  { id: "basketball", label: "Basketball", group: "court", icon: "CircleDot", met: 6.5, paceMode: "time", color: "#8a6d2e", defaultMoving: true },
  { id: "climb", label: "Rock Climb", group: "workout", icon: "Mountain", met: 8.0, paceMode: "time", color: "#7a5c3e", defaultMoving: false },
  { id: "elliptical", label: "Elliptical", group: "workout", icon: "Activity", met: 5.0, paceMode: "time", color: "#5d5d66", defaultMoving: false },
  { id: "stair_climber", label: "Stair Climber", group: "workout", icon: "Activity", met: 9.0, paceMode: "time", color: "#5d5d66", defaultMoving: false },
  { id: "crossfit", label: "CrossFit", group: "workout", icon: "Zap", met: 8.5, paceMode: "time", color: "#b8452c", defaultMoving: false },
  { id: "pilates", label: "Pilates", group: "workout", icon: "Flower2", met: 3.5, paceMode: "time", color: "#8a5d7a", defaultMoving: false },
  { id: "handcycle", label: "Hand Cycle", group: "ride", icon: "Bike", met: 7.0, paceMode: "speed", color: "#4a8f5c", defaultMoving: true },
  { id: "wheelchair", label: "Wheelchair", group: "walk", icon: "PersonStanding", met: 6.5, paceMode: "pace", color: "#8a6d3b", defaultMoving: true },
  { id: "virtual_run", label: "Virtual Run", group: "run", icon: "MonitorPlay", met: 9.8, paceMode: "pace", color: "#fc4c02", defaultMoving: false },
  { id: "canoe", label: "Canoe", group: "water", icon: "Sailboat", met: 5.8, paceMode: "speed", color: "#3a6b8a", defaultMoving: true },
  { id: "sail", label: "Sail", group: "water", icon: "Sailboat", met: 3.0, paceMode: "time", color: "#3a6b8a", defaultMoving: true },
  { id: "windsurf", label: "Windsurf", group: "water", icon: "Waves", met: 6.0, paceMode: "speed", color: "#3a6b8a", defaultMoving: true },
  { id: "surf", label: "Surf", group: "water", icon: "Waves", met: 5.5, paceMode: "time", color: "#3a6b8a", defaultMoving: true },
  { id: "snowshoe", label: "Snowshoe", group: "snow", icon: "Snowflake", met: 8.5, paceMode: "pace", color: "#3e7ca6", defaultMoving: true },
  { id: "golf", label: "Golf", group: "court", icon: "CircleDot", met: 4.5, paceMode: "time", color: "#6d8a3a", defaultMoving: true },
];

export const SPORT_MAP: Record<string, SportDef> = Object.fromEntries(SPORTS.map((s) => [s.id, s]));

export function sportOf(id: string): SportDef {
  return SPORT_MAP[id] ?? SPORT_MAP.workout;
}

// Recording sport picker order
export const RECORD_SPORTS = [
  "run", "trail_run", "walk", "hike", "ride", "gravel", "mtb", "ebike",
  "swim", "open_water", "row", "kayak", "canoe", "ski", "snowboard", "ice_skate", "snowshoe",
  "workout", "gym", "yoga", "hiit", "crossfit", "pilates", "tennis", "football", "basketball", "climb", "elliptical", "stair_climber",
  "virtual_ride", "virtual_run", "handcycle", "wheelchair", "golf", "sail", "windsurf", "surf",
];

export const DEFAULT_SPORTS = ["run", "ride", "walk", "hike", "gravel", "swim", "gym", "yoga"];
