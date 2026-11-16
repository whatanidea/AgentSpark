export type AdoProject = "operations" | "platform";
export type AdoItemType = "Bug" | "User Story" | "Task";
export type AdoItem = {
  id: number; project: AdoProject; item_type: AdoItemType; title: string; description: string;
  state: string; revision: number; source_url: string; source_updated_at: string;
};
export type AdoImportedItem = AdoItem & { imported_at: string; imported_by: string; content_digest: string };
export type AdoPlanItem = {
  item_type: "Epic" | "Feature" | "Task"; title: string; description: string; parent_index: number | null;
};
export type AdoPreview = {
  id: string; actor: string; project: AdoProject; connection_revision: string;
  assessment_id: string; analysis_id: string; source_version: string;
  expires_at: string; items: AdoPlanItem[]; digest: string;
};
export type AdoReceipt = {
  preview_id: string; digest: string; assessment_id: string; analysis_id: string; project: AdoProject;
  confirmed_by: string; confirmed_at: string;
  items: (AdoPlanItem & { id: number; parent_id: number | null; source_url: string; state: "New" })[];
};
export type AdoDiscoveryPreview = {
  id: string; actor: string; project: AdoProject; connection_revision: string;
  item_ids: number[]; imports_digest: string; expires_at: string;
  engagement: DiscoveryEngagement; sources: (DiscoverySource & { source_reference: string })[]; digest: string;
};
export type AdoDiscoveryReceipt = {
  preview: AdoDiscoveryPreview; engagement_id: string; confirmed_at: string; expires_at: string;
  status: "pending" | "completed";
};
export type AdoDiscoveryBrief = Required<Pick<DiscoveryEngagement,
  "title" | "objective" | "business_units" | "sponsor" | "engagement_owner" |
  "required_topics" | "excluded_topics" | "success_measures">>;

export function discoveryBrief(engagement: DiscoveryEngagement): AdoDiscoveryBrief {
  const { title, objective, business_units, sponsor, engagement_owner, required_topics, excluded_topics } = engagement;
  return { title, objective, business_units, sponsor, engagement_owner, required_topics, excluded_topics,
    success_measures: engagement.success_measures || "" };
}

export type AdoIntegration = {
  mode: "simulator"; external_connection: false;
  identity_id: string;
  can_confirm: boolean;
  can_confirm_discovery: boolean;
  version: string; expires_at: string; projects: { id: AdoProject; name: string }[];
  permissions: { read: boolean; write: boolean; manage: boolean };
  connection: { project: AdoProject; item_types: AdoItemType[]; revision: string } | null;
  available_items: AdoItem[]; imported: AdoImportedItem[]; preview: AdoPreview | null; receipts: AdoReceipt[];
  discovery_preview: AdoDiscoveryPreview | null; discovery_receipts: AdoDiscoveryReceipt[];
  audit: { action: string; actor: string; at: string; detail: string }[];
};
import type { DiscoveryEngagement, DiscoverySource } from "./api";
