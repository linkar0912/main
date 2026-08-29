/** Minimal event shape produced by `normalizeFacebookWebhook`. */
export type FacebookNormalizedEvent = {
  id: string;
  pageId: string;
  commentId: string;
  postId: string;
  text: string;
  senderId?: string;
  senderName?: string;
  /** Set when this is a reply to another comment. Useful for threading UI later. */
  parentId?: string;
  timestamp: number;
};

/** Connection record the runner and the settings UI share. Mirrors
 * MetaConnection but with `pageId` instead of `igUserId` so the two are
 * unambiguous. */
export type FacebookConnection = {
  pageId: string;
  accessToken: string;
};

export type FacebookCommentReply = {
  message: string;
};

export type FacebookSendResult = {
  /** Facebook returns the new comment id, not a message id. */
  id?: string;
};
