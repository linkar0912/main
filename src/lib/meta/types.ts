export type MetaConnection = {
  igUserId: string;
  accessToken: string;
};

export type MetaTextMessage = {
  type: "text";
  text: string;
};

export type MetaLinkMessage = {
  type: "link";
  text: string;
  url: string;
};

export type MetaButtonMessage = {
  type: "button";
  text: string;
  buttonLabel: string;
  url: string;
};

export type MetaMessage = MetaTextMessage | MetaLinkMessage | MetaButtonMessage;

export type MetaTokenResult = {
  accessToken: string;
  userId: string;
  expiresIn?: number;
  permissions?: string[];
};

export type MetaSendResult = {
  recipient_id?: string;
  message_id?: string;
};

export type MetaMedia = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp: string;
};

export type MetaMediaPage = {
  data: MetaMedia[];
  after?: string;
};

export type MetaPrivateReply = {
  text: string;
  quickReply?: {
    title: string;
    payload: string;
  };
};
