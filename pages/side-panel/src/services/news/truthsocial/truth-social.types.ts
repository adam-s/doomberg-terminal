export interface TruthSocialAccount {
  accepting_messages: boolean;
  acct: string;
  avatar: string;
  avatar_static: string;
  bot: boolean;
  chats_onboarded: boolean;
  created_at: string; // ISO date string
  discoverable: boolean;
  display_name: string;
  emojis: unknown[];
  feeds_onboarded: boolean;
  fields: unknown[];
  followers_count: number;
  following_count: number;
  group: boolean;
  header: string;
  header_static: string;
  id: string;
  last_status_at: string; // e.g., "2025-05-19"
  location: string;
  locked: boolean;
  note: string; // HTML string
  show_nonmember_group_statuses: boolean;
  statuses_count: number;
  tv_account: boolean;
  tv_onboarded: boolean;
  unauth_visibility: boolean;
  url: string;
  username: string;
  verified: boolean;
  website: string;
}

export interface TruthSocialMediaAttachmentMetaOriginal {
  aspect: number;
  height: number;
  size: string; // e.g., "909x1130"
  width: number;
  duration?: number;
  bitrate?: number;
  frame_rate?: string;
}

export interface TruthSocialMediaAttachmentMetaSmall {
  aspect: number;
  height: number;
  size: string; // e.g., "718x892"
  width: number;
}

export interface TruthSocialMediaAttachmentMetaColors {
  accent: string;
  background: string;
  foreground: string;
}

export interface TruthSocialMediaAttachmentMeta {
  original: TruthSocialMediaAttachmentMetaOriginal;
  small: TruthSocialMediaAttachmentMetaSmall;
  colors?: TruthSocialMediaAttachmentMetaColors;
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  GIFV = 'gifv',
  AUDIO = 'audio',
}

export interface TruthSocialMediaAttachment {
  blurhash: string | null;
  description: string | null;
  external_video_id: string | null;
  id: string;
  meta: TruthSocialMediaAttachmentMeta;
  preview_remote_url: string | null;
  preview_url: string;
  processing: string; // This could be a boolean or a more specific status enum if known
  remote_url: string | null;
  text_url: string | null;
  type: MediaType;
  url: string;
}

export enum CardType {
  LINK = 'link',
  PHOTO = 'photo',
  VIDEO = 'video',
  RICH = 'rich',
}

export interface TruthSocialCard {
  author_name: string;
  author_url: string;
  blurhash: string;
  description: string;
  embed_url: string;
  group: null | unknown; // Structure of group is unknown
  height: number;
  html: string;
  id: string | null;
  image: string | null;
  links: null | unknown; // Structure of links is unknown
  provider_name: string;
  provider_url: string;
  title: string;
  type: CardType;
  url: string;
  width: number;
}

export interface TruthSocialMention {
  acct: string;
  id: string;
  url: string;
  username: string;
}

export interface TruthSocialPollOption {
  title: string;
  votes_count: number | null;
}

export interface TruthSocialPoll {
  id: string;
  expires_at: string | null; // ISO date string or null
  expired: boolean;
  multiple: boolean;
  votes_count: number;
  voters_count: number | null;
  voted: boolean;
  own_votes: number[] | null;
  options: TruthSocialPollOption[];
  emojis: unknown[];
}

export interface TruthSocialTag {
  name: string;
  url?: string; // URL to the tag's page
  // history?: any[]; // Example of other potential fields, use specific types if known
  // following?: boolean; // Example
}

export interface TruthSocialCustomEmoji {
  shortcode: string;
  url: string;
  static_url: string;
  visible_in_picker: boolean;
  category?: string;
}

export enum StatusVisibility {
  PUBLIC = 'public',
  UNLISTED = 'unlisted',
  PRIVATE = 'private',
  DIRECT = 'direct',
}

export interface TruthSocialStatus {
  account: TruthSocialAccount;
  bookmarked: boolean;
  card: TruthSocialCard | null;
  content: string; // HTML string
  created_at: string; // ISO date string
  downvotes_count: number;
  emojis: TruthSocialCustomEmoji[];
  favourited: boolean;
  favourites_count: number;
  group: null | unknown; // Structure of group is unknown
  id: string;
  in_reply_to: TruthSocialStatus | null;
  in_reply_to_account_id: string | null;
  in_reply_to_id: string | null;
  language: string | null;
  media_attachments: TruthSocialMediaAttachment[];
  mentions: TruthSocialMention[];
  muted: boolean;
  pinned: boolean;
  poll: TruthSocialPoll | null;
  quote: TruthSocialStatus | null;
  quote_id: string | null;
  reaction: null | unknown; // Structure of reaction is unknown
  reblog: TruthSocialStatus | null;
  reblogged: boolean;
  reblogs_count: number;
  replies_count: number;
  sensitive: boolean;
  spoiler_text: string;
  sponsored: boolean;
  tags: TruthSocialTag[];
  upvotes_count: number;
  uri: string;
  url: string;
  visibility: StatusVisibility;
  votable: boolean;
}

export interface TruthSocialAnalysis {
  originalStatusId: string;
  analysisText?: string;
}
