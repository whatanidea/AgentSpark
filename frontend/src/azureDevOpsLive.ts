import type { DiscoveryEngagement, DiscoverySource } from "./api";

export interface LiveItem {
  id: number; title: string; description: string; item_type: string; state: string;
  organization: string; project_id: string; project_name: string; revision: number;
  changed_at: string; source_url: string; content_digest: string;
}
export interface LivePreview {
  id: string; actor: string; digest: string; expires_at: string; connection_revision: string;
  engagement: DiscoveryEngagement; items: LiveItem[]; sources: (DiscoverySource & { source_reference: string })[];
}
export interface LiveReceipt {
  preview_id: string; digest: string; actor: string; engagement_id: string; created_at: string;
}
export interface LiveState {
  mode: "read-only"; version: string; identity_id: string; can_edit: boolean;
  permissions: { read: boolean; write: boolean; manage: boolean };
  connection: { organization: string; project_id: string; project_name: string; revision: string } | null;
  preview: LivePreview | null;
  creation: { preview: LivePreview; engagement_id: string; confirmed_at: string } | null;
  receipts: LiveReceipt[]; activity: { action: string; actor: string; at: string }[]; expires_at: string;
}
export interface ProjectPage { items: { id: string; name: string }[]; next_cursor: string }
export interface ItemPage { items: LiveItem[]; next_before: number | null }
