export type Client = {
  id: string;
  name: string;
  primary_contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export type Matter = {
  id: string;
  name: string;
  client_id: string | null;
  practice_area: string | null;
  status: string;
  open_date: string;
  description: string | null;
  hourly_rate: number | null;
  assigned_to: string | null;
  priority: string;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
};

export type Timer = {
  id: string;
  label: string | null;
  matter_id: string | null;
  accumulated_seconds: number;
  is_running: boolean;
  last_started_at: string | null;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  matter_id: string | null;
  activity: string | null;
  lawyer: string;
  duration_seconds: number;
  note: string | null;
  logged_at: string;
};

export type ActivityItem = {
  id: string;
  kind: string;
  description: string;
  client_id: string | null;
  matter_id: string | null;
  created_at: string;
};

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  created_by: string | null;
  created_at: string;
};

export const PRACTICE_AREAS = [
  "Real Estate",
  "Business Law",
  "Family Estates",
] as const;

export const ATTORNEYS = ["Isa Abdur-Rahman", "Yari Corsino"] as const;

export const PRIORITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const ACTIVITY_TYPES = [
  "Email",
  "Draft",
  "Meeting",
  "Phone Call",
  "Research",
  "Court Appearance",
  "Review",
] as const;
