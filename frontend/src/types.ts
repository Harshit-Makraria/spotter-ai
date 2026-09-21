export type DutyStatus = "off_duty" | "sleeper_berth" | "driving" | "on_duty";

export type EventKind =
  | "drive"
  | "pretrip"
  | "posttrip"
  | "pickup"
  | "dropoff"
  | "fuel"
  | "break_30"
  | "rest_10"
  | "restart_34";

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface RouteLeg {
  distance_miles: number;
  duration_hours: number;
}

export interface RouteInfo {
  distance_miles: number;
  provider: string;
  geometry: [number, number][];
  legs: RouteLeg[];
}

export interface TripSummary {
  total_miles: number;
  driving_hours: number;
  on_duty_hours: number;
  off_duty_hours: number;
  sleeper_hours: number;
  total_elapsed_hours: number;
  start_time: string;
  end_time: string;
  cycle_hours_used_start: number;
  cycle_hours_used_end: number;
  cycle_hours_remaining_end: number;
  fuel_stops: number;
  rest_breaks: number;
  daily_resets: number;
  restarts: number;
  log_days: number;
}

export interface Segment {
  index: number;
  status: DutyStatus;
  kind: EventKind;
  title: string;
  label: string;
  start: string;
  end: string;
  hours: number;
  miles: number;
  start_mile: number;
  end_mile: number;
  location: string;
  lat: number | null;
  lon: number | null;
}

export interface Stop {
  index: number;
  kind: EventKind;
  title: string;
  label: string;
  start: string;
  end: string;
  hours: number;
  mile: number;
  location: string;
  lat: number | null;
  lon: number | null;
}

export interface GridEntry {
  status: DutyStatus;
  row: number;
  start_minute: number;
  end_minute: number;
  kind: EventKind;
  label: string;
  location: string;
  segment_index: number | null;
}

export interface Remark {
  minute: number;
  location: string;
  note: string;
  kind: EventKind;
}

export interface LogDay {
  date: string;
  miles_driven: number;
  total_on_duty_hours: number;
  cycle_hours_used: number;
  cycle_hours_remaining: number;
  /** On-duty hours over the last N days including this one, keyed by N. */
  rolling_on_duty: Record<string, number>;
  balanced: boolean;
  totals: Record<DutyStatus, number>;
  entries: GridEntry[];
  remarks: Remark[];
}

export interface ComplianceCheck {
  rule: string;
  cfr: string;
  passed: boolean;
  detail: string;
}

export interface Compliance {
  feasible: boolean;
  violations: string[];
  notes: string[];
  checks: ComplianceCheck[];
}

export interface TripInputs {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_hours_used: number;
  start_time: string;
  avg_speed_mph: number;
  cycle_limit_hours: number;
  include_inspections: boolean;
}

export interface TripPlan {
  share_id?: string | null;
  inputs: TripInputs;
  places: { current: Place; pickup: Place; dropoff: Place };
  route: RouteInfo;
  summary: TripSummary;
  segments: Segment[];
  stops: Stop[];
  log_days: LogDay[];
  compliance: Compliance;
}

export interface TripRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_hours_used: number;
  start_time?: string;
  avg_speed_mph?: number;
  cycle_limit_hours?: number;
  include_inspections?: boolean;
}
