// Define message interfaces
export interface InitializeContentScriptMessage {
  type: 'doomberg:initializeContentScript';
}

export interface CreateMainPortMessage {
  type: 'doomberg:createMAINPort';
  id: string;
}

export interface HelloMessage {
  type: 'doomberg:hello';
}

export type RobindaHoodMessage =
  | InitializeContentScriptMessage
  | CreateMainPortMessage
  | HelloMessage;

// Define the Port interface
export interface Port {
  name: string;
  postMessage: (message: RobindaHoodMessage) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (callback: (message: RobindaHoodMessage) => void) => void;
  };
  onDisconnect: {
    addListener: (callback: () => void) => void;
  };
}
