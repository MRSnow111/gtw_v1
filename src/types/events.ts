export type ClientEvent =
  | { type: "chat.send"; chatId: string; clientMessageId: string; text: string; attachments?: { fileId: string }[] }
  | { type: "chat.cancel"; chatId: string; messageId: string }
  | { type: "settings.update"; chatId: string; settings: Partial<any> }
  | { type: "chat.status"; chatId: string };

export type ServerEvent =
  | { type: "connection.ack"; userId: string }
  | { type: "chat.accepted"; chatId: string; clientMessageId: string; messageId: string }
  | { type: "agent.thinking"; chatId: string }
  | { type: "chat.delta"; chatId: string; messageId: string; text: string }
  | { type: "chat.done"; chatId: string; messageId: string; fullText: string }
  | { type: "chat.cancelled"; chatId: string; messageId: string; partialText: string }
  | { type: "system.message"; chatId: string; text: string }
  | { type: "settings.updated"; chatId: string; settings: any }
  | { type: "file.ready"; fileId: string; name: string; url?: string }
  | { type: "error"; chatId?: string; code: string; message: string };
