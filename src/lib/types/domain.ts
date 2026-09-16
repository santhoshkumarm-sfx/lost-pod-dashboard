// Domain types mirroring supabase/migrations/0001_init_schema.sql.
// Run `supabase gen types typescript` against your project for exhaustive
// generated types (see README) — these hand-written types cover what the
// app's UI and API routes actually touch, and are the source of truth for
// the literal unions (status codes, roles) used throughout the codebase.

export type UserRole = "super_admin" | "admin" | "internal_team" | "client_poc";

export type SourceType = "google_sheet" | "email" | "manual";

export type CaseStatusCategory = "open" | "lost_pending_approval" | "lost" | "closed";

export type PodStatus = "not_shared" | "requested" | "shared" | "invalid" | "not_applicable";

export type ApprovalAction = "requested" | "approved" | "rejected" | "sent_back_for_investigation";

// Keep in sync with status_master seed rows in 0001_init_schema.sql.
export const STATUS_CODES = [
  "PENDING",
  "WORKING_ON_IT",
  "SHIPMENT_AT_DC",
  "SHIPMENT_AT_HUB",
  "POD_SHARED",
  "LOST_PENDING_APPROVAL",
  "LOST",
  "CLOSED",
] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

export const AGING_BUCKETS = ["0-2", "3-7", "8-15", "16-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  client_id: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  default_sla_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPoc {
  id: string;
  profile_id: string;
  client_id: string;
  designation: string | null;
  can_request_lost: boolean;
  can_view_internal_remarks: boolean;
  is_active: boolean;
}

export interface Case {
  case_id: string;
  case_number: string;
  awb: string;
  client_id: string;
  client_poc_id: string | null;
  escalation_date: string; // date
  delivery_date: string | null;
  location: string | null;
  hub: string | null;
  seller_name: string | null;
  complaint_type: string | null;
  reason: string | null;
  priority: string | null;
  shipment_status: string | null;
  status_code: StatusCode;
  pod_status: PodStatus;
  pod_link: string | null;
  source_type: SourceType;
  source_workbook: string | null;
  source_sheet: string | null;
  source_row: number | null;
  source_record_hash: string | null;
  email_subject: string | null;
  email_message_id: string | null;
  email_thread_id: string | null;
  team_status: string | null;
  team_remark: string | null;
  client_remark: string | null;
  assigned_agent: string | null;
  final_aging_days: number | null;
  closure_date: string | null;
  lost_requested_at: string | null;
  lost_requested_by: string | null;
  lost_approved_at: string | null;
  lost_approved_by: string | null;
  needs_manual_review: boolean;
  extraction_confidence: number | null;
  product_name: string | null;
  product_value: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Shape returned by the `cases_with_aging` view — what every list/detail
// page and report should actually query.
export interface CaseWithAging extends Case {
  aging_days: number;
  aging_bucket: AgingBucket | string;
  status_label: string;
  status_category: CaseStatusCategory;
  client_name_resolved: string;
}

export interface CaseUpdate {
  id: string;
  case_id: string;
  changed_by: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  source: SourceType | null;
  note: string | null;
  created_at: string;
}

export interface LostApproval {
  id: string;
  case_id: string;
  action: ApprovalAction;
  acted_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface EmailRecord {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string;
  sender: string;
  recipients: string | null;
  email_date: string;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  client_id: string | null;
  created_at: string;
}

// Fields the email-extractor and sheet column-mapper both try to produce.
// Anything that comes back null/undefined is a gap the review screen
// highlights for manual completion.
export interface ExtractedCaseFields {
  awb: string | null;
  client_name_raw: string | null;
  escalation_date: string | null;
  reason: string | null;
  complaint_type: string | null;
  location: string | null;
  hub: string | null;
  delivery_date: string | null;
  seller_name: string | null;
  priority: string | null;
  client_poc_raw: string | null;
  team_remark: string | null;
}

export interface ExtractionResult {
  fields: ExtractedCaseFields;
  confidence: number; // 0..1
  missingFields: (keyof ExtractedCaseFields)[];
  needsManualReview: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  internal_team: "Internal Team",
  client_poc: "Client POC",
};

export const STATUS_LABELS: Record<StatusCode, string> = {
  PENDING: "Pending",
  WORKING_ON_IT: "Working on it",
  SHIPMENT_AT_DC: "Shipment at DC",
  SHIPMENT_AT_HUB: "Shipment at Hub",
  POD_SHARED: "POD Shared",
  LOST_PENDING_APPROVAL: "Lost — Pending Admin Approval",
  LOST: "Lost",
  CLOSED: "Closed",
};
