import { conversationRequest as request, type ChatStreamOptions, type InferenceModel } from "./api";

export type ChatKind = "discovery" | "intake";
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; at: string; reply_to: string | null; interrupted: boolean };
export type ChatSummary = { id: string; title: string; created_at: string; updated_at: string; expires_at: string };
export type ChatDraft = {
  id: string; kind: ChatKind; fields: Record<string, string>; expires_at: string; digest: string;
  sources: { message_id: string; quote: string }[];
  captures: { field: string; value: string; message_id: string; quote: string }[];
};
export type Conversation = ChatSummary & {
  version: string; model: InferenceModel; messages: ChatMessage[];
  pending: { id: string; generation: string; started_at: string } | null;
  suggestion: { kind: ChatKind; reason: string; source_ids: string[] } | null;
  draft: ChatDraft | null; can_create: boolean; creation_pending: boolean;
  link: { kind: ChatKind; workflow_id: string; draft_id: string; digest: string; created_at: string } | null;
};
export const conversations = {
  list: (cursor = "") => request<{ items: ChatSummary[]; cursor: string }>(`?cursor=${encodeURIComponent(cursor)}`),
  get: (id: string) => request<Conversation>(`/${id}`),
  create: (model_id: string) => request<Conversation>("", "POST", { model_id }),
  rename: (chat: Conversation, title: string) => request<Conversation>(`/${chat.id}`, "PATCH", { title, version: chat.version }),
  delete: (chat: Conversation) => request<{ status: string }>(`/${chat.id}?version=${encodeURIComponent(chat.version)}`, "DELETE"),
  send: (chat: Conversation, id: string, message: string, stream: ChatStreamOptions) =>
    request<Conversation>(`/${chat.id}/messages`, "POST", { version: chat.version, id, message }, stream),
  stop: (chat: Conversation, id: string) => request<Conversation>(`/${chat.id}/stop`, "POST", { id }),
  dismiss: (chat: Conversation) => request<Conversation>(`/${chat.id}/dismiss`, "POST", { version: chat.version }),
  preview: (chat: Conversation, kind: ChatKind) => request<Conversation>(`/${chat.id}/preview`, "POST", { version: chat.version, kind }),
  edit: (chat: Conversation, draft: ChatDraft, fields: Record<string, string>) =>
    request<Conversation>(`/${chat.id}/preview`, "PUT", { version: chat.version, draft_id: draft.id, fields }),
  confirm: (chat: Conversation, draft: ChatDraft) => request<Conversation>(`/${chat.id}/confirm`, "POST",
    { version: chat.version, draft_id: draft.id, digest: draft.digest, reviewed: true }),
};
