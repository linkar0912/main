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
