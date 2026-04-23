import type { Configuration } from "@azure/msal-browser";

// TODO: Register a new Azure App for this portal and replace clientId below.
// Tenant is shared across MAC internal apps.
export const msalConfig: Configuration = {
  auth: {
    clientId: "REPLACE_WITH_NEW_AZURE_APP_CLIENT_ID",
    authority: "https://login.microsoftonline.com/422e0e56-e8fe-4fc5-8554-b9b89f3cadac",
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage" },
};

export const loginRequest = { scopes: [] };
export const ALLOWED_DOMAINS = ["macproducts.net", "macimpulse.net"];
