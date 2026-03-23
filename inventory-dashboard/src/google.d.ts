interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }) => void;
  prompt: () => void;
  renderButton: (element: HTMLElement, config: { theme?: string; size?: string; width?: number; text?: string; shape?: string }) => void;
  disableAutoSelect: () => void;
}

interface Window {
  google?: {
    accounts?: {
      id: GoogleAccountsId;
    };
  };
}
