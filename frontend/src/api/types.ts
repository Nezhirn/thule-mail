export interface Account {
  id: number;
  email: string;
  display_name: string;
  color: string;
  imap_host: string;
  imap_port: number;
  imap_security: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  username: string;
  enabled: boolean;
  pool_size: number;
  sync_interval_sec: number;
  page_size: number;
  sort_order: number;
}

export interface Address {
  name: string;
  email: string;
}

export interface MessageListItem {
  account_id: number;
  folder: string;
  uid: number;
  subject: string;
  from: Address[];
  to: Address[];
  date: string | null;
  snippet: string;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  has_attachments: boolean;
  size: number;
  account_color?: string;
  account_email?: string;
}

export interface MessageList {
  messages: MessageListItem[];
  next_cursor: number | null;
}

export interface Attachment {
  part: string;
  filename: string;
  content_type: string;
  size: number;
  is_inline: boolean;
  content_id: string | null;
}

export interface FullMessage {
  account_id: number;
  folder: string;
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string | null;
  message_id: string;
  html: string | null;
  text: string | null;
  attachments: Attachment[];
}

export interface Folder {
  name: string;
  delimiter: string;
  flags: string[];
  alias: string | null;
  sort_order: number;
  pinned: boolean;
  hidden: boolean;
  unread: number;
}

export interface AutodetectResult {
  detected: boolean;
  domain?: string;
  imap_host?: string;
  imap_port?: number;
  imap_security?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_security?: string;
  note?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  folders: string[];
}
