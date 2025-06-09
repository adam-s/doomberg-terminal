export interface IBaseMessage {
  type: string;
}

export interface IDocumentIdMessage extends IBaseMessage {
  type: 'doomberg:requestDocumentId';
}

export interface IWindowIdMessage extends IBaseMessage {
  type: 'doomberg:requestWindowId';
}

export interface IConsoleLogMessage extends IBaseMessage {
  type: 'doomberg:console.log';
  [key: string]: unknown;
}

export interface ICreateMAINPortMessage extends IBaseMessage {
  type: 'doomberg:createMAINPort';
  id: string;
}

export const DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE = 'doomberg:sidePanelVisibilityChange';
export interface ISidePanelVisibilityChangeMessage extends IBaseMessage {
  type: typeof DOOMBERG_SIDE_PANEL_VISIBILITY_CHANGE;
  open: boolean;
  windowId: number;
}

export const DOOMBERG_SIDE_PANEL_RELOAD = 'doomberg:sidePanelReload';
export interface ISidePanelReloadMessage extends IBaseMessage {
  type: typeof DOOMBERG_SIDE_PANEL_RELOAD;
  windowId: number;
}

export interface IInformationResponse {
  documentId?: string;
  windowId?: number;
  tabId?: number;
  frameId?: number;
  error?: string;
}

export type DocumentMessage =
  | IDocumentIdMessage
  | IWindowIdMessage
  | IConsoleLogMessage
  | ICreateMAINPortMessage
  | ISidePanelVisibilityChangeMessage
  | ISidePanelReloadMessage
  | { type: 'doomberg:requestInformation' }
  | IIPCMessageTypes;

export interface IDocumentIdResponse {
  documentId?: string;
  error?: string;
}

export interface IWindowIdResponse {
  windowId?: number;
  error?: string;
}

export const DOOMBERG_MESSAGE = 'doomberg:message';
export const DOOMBERG_HELLO = 'doomberg:hello';
export const DOOMBERG_DISCONNECT = 'doomberg:disconnect';
export const ROBINDAHOOD_RECONNECT = 'doomberg:reconnect';

export interface IIPCMessage {
  type: string;
}

export interface IIPCHelloMessage extends IIPCMessage {
  type: typeof DOOMBERG_HELLO;
  source: string;
}

export interface IIPCDisconnectMessage extends IIPCMessage {
  type: typeof DOOMBERG_DISCONNECT;
  source: string;
  target: string;
}

export interface IIPCReconnectMessage extends IIPCMessage {
  type: typeof ROBINDAHOOD_RECONNECT;
  source: string;
  target: string;
}

export interface IIPCDataMessage extends IIPCMessage {
  type: typeof DOOMBERG_MESSAGE;
  source: string;
  body: number[];
  target?: string;
}

export type IIPCMessageTypes = IIPCHelloMessage | IIPCDisconnectMessage | IIPCDataMessage;

export interface Message {
  type: string;
  source: string;
  body: number[]; // Serialized as an array of numbers
  target: string;
}

export type DocumentResponse =
  | IDocumentIdResponse
  | IWindowIdResponse
  | IInformationResponse
  | { error: string };
