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
export const ALLOWED_DOMAINS = ["macproducts.net", "macimpulse.net"];
