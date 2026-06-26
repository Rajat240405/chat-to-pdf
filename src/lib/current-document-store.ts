import type { ConversationDocument } from "./mock-data";

let currentDocument: ConversationDocument | null = null;

export function setCurrentDocument(doc: ConversationDocument) {
  currentDocument = doc;
}

export function getCurrentDocument(): ConversationDocument | null {
  return currentDocument;
}

export function clearCurrentDocument() {
  currentDocument = null;
}