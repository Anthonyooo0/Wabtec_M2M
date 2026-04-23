import type { Configuration } from "@azure/msal-browser";

// MAC-Wabtec-M2M Entra ID App Registration.
// Tenant is shared across MAC internal apps.
export const msalConfig: Configuration = {
  auth: {
    clientId: "6c1c307b-8a7a-43d8-a673-14cee38b1d52",
    authority: "https://login.microsoftonline.com/422e0e56-e8fe-4fc5-8554-b9b89f3cadac",
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage" },
};

export const loginRequest = { scopes: [] };

// Incrementally-requested Graph scope for the email-attachment feature. We
// don't request this at login so users who never attach emails don't get a
// scary consent screen — MSAL prompts for it on first use of the picker.
export const graphMailReadRequest = { scopes: ["Mail.Read"] };

// Same incremental pattern for Teams chat picker — covers 1:1 + group chats
// (not channel posts; that needs ChannelMessage.Read.All which is broader).
export const graphChatReadRequest = { scopes: ["Chat.Read"] };

export const ALLOWED_DOMAINS = ["macproducts.net", "macimpulse.net"];
