export type Client = {
  id: string;
  name: string;
  client_type: string; // "individual" | "business"
  primary_contact: string | null;
  contact_title: string | null; // business: contact person's title
  partner_name: string | null; // individual: second contact (spouse/partner)
  partner_email: string | null;
  partner_phone: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  archived: boolean;
  created_by: string | null;
  partner_relationship: string | null;
  partner_split: boolean;
  billing_contact: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_notes: string | null;
  created_at: string;
};

export const CLIENT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
] as const;

// Professional (non-client) contacts: opposing counsel, co-counsel, experts, etc.
export type Contact = {
  id: string;
  name: string;
  role: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export const CONTACT_ROLES = [
  { value: "outside_counsel", label: "Outside Counsel" },
  { value: "co_counsel", label: "Co-Counsel" },
  { value: "adverse_counsel", label: "Adverse Counsel" },
  { value: "expert", label: "Expert / Witness" },
  { value: "vendor", label: "Vendor / Service" },
  { value: "other", label: "Other" },
] as const;

export const contactRoleLabel = (v: string) =>
  CONTACT_ROLES.find((r) => r.value === v)?.label ?? "Other";

export type Matter = {
  id: string;
  name: string;
  client_id: string | null;
  practice_area: string | null;
  status: string;
  open_date: string;
  description: string | null;
  hourly_rate: number | null;
  rate_type: string;
  assigned_to: string | null;
  priority: string;
  case_timeline_type: string | null;
  show_case_timeline: boolean;
  show_conflict_check: boolean;
  notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  opened_by: string | null;
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
  billable: boolean;
  invoiced: boolean;
  rate: number | null;
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
  assignee: string | null;
  created_by: string | null;
  matter_id: string | null;
  due_date: string | null;
  priority: string;
  created_at: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
};

export type Invoice = {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  number: string | null;
  amount: number | null;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
};

export type EventItem = {
  id: string;
  matter_id: string | null;
  title: string;
  event_date: string;
  kind: string;
  completed: boolean;
  created_at: string;
};

export const PRACTICE_AREAS = [
  "Real Estate",
  "Business Law",
  "Family Estates",
] as const;

export const ATTORNEYS = [
  "Isa Abdur-Rahman",
  "Yari Corsino",
  "Paralegal",
] as const;

export type TaskComment = {
  id: string;
  todo_id: string;
  author: string | null;
  body: string;
  created_at: string;
};

// Distinct avatar color per person (Yari — the user — is blue).
const PERSON_COLORS: Record<string, string> = {
  "Yari Corsino": "linear-gradient(135deg, #1c3577 0%, #3a63c4 100%)",
  "Isa Abdur-Rahman": "#2f8f83",
  "Paralegal": "#7c5cbf",
};
const PERSON_PALETTE = [
  "#2f6bff", "#e0699a", "#e6884f", "#3fa373",
  "#7c5cbf", "#d9a441", "#4c9d6b", "#c0673b",
];
export function personColor(name: string | null | undefined): string {
  if (!name) return "#94a3b8";
  if (PERSON_COLORS[name]) return PERSON_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_PALETTE[h % PERSON_PALETTE.length];
}

export const PRIORITIES = [
  { value: "-", label: "—" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const RATE_TYPES = [
  { value: "hourly", label: "Hourly" },
  { value: "flat", label: "Flat rate" },
] as const;

export const CASE_TIMELINE_TEMPLATES = [
  "LLC Formation",
  "Estate Planning",
  "Real Estate",
  "Other",
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
