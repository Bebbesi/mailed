/**
 * Presets for linking external mailboxes (Gmail, Outlook…). Shared by the
 * server (connection settings, validation) and the "Add account" dialog.
 */
export const LINKED_PROVIDERS = ["gmail", "outlook", "yahoo", "icloud", "other"] as const;
export type LinkedProvider = (typeof LINKED_PROVIDERS)[number];

export const SERVER_SECURITY = ["tls", "starttls"] as const;
/** `tls`: encrypted from the first byte (993/465). `starttls`: upgraded before login (143/587). */
export type ServerSecurity = (typeof SERVER_SECURITY)[number];

export type ServerConfig = { host: string; port: number; security: ServerSecurity };

export type OAuthProviderId = "google" | "microsoft";

export type ProviderPreset = {
  id: LinkedProvider;
  name: string;
  imap?: ServerConfig;
  smtp?: ServerConfig;
  /** False when the provider no longer accepts passwords from other apps. */
  passwordSupported: boolean;
  passwordLabel: string;
  passwordHelp?: string;
  helpUrl?: string;
  oauth?: OAuthProviderId;
  domains: string[];
};

export const PROVIDER_PRESETS: Record<LinkedProvider, ProviderPreset> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    imap: { host: "imap.gmail.com", port: 993, security: "tls" },
    smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
    passwordSupported: true,
    passwordLabel: "App password",
    passwordHelp: "Google needs 2-Step Verification turned on. Then create an app password and paste the 16 letters here.",
    helpUrl: "https://myaccount.google.com/apppasswords",
    oauth: "google",
    domains: ["gmail.com", "googlemail.com"],
  },
  outlook: {
    id: "outlook",
    name: "Outlook",
    imap: { host: "outlook.office365.com", port: 993, security: "tls" },
    smtp: { host: "smtp-mail.outlook.com", port: 587, security: "starttls" },
    passwordSupported: false,
    passwordLabel: "Password",
    oauth: "microsoft",
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.it", "hotmail.it", "live.it"],
  },
  yahoo: {
    id: "yahoo",
    name: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, security: "tls" },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, security: "tls" },
    passwordSupported: true,
    passwordLabel: "App password",
    passwordHelp: "In Yahoo Account security, generate an app password and paste it here.",
    helpUrl: "https://login.yahoo.com/account/security",
    domains: ["yahoo.com", "yahoo.it", "ymail.com", "rocketmail.com"],
  },
  icloud: {
    id: "icloud",
    name: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, security: "tls" },
    smtp: { host: "smtp.mail.me.com", port: 587, security: "starttls" },
    passwordSupported: true,
    passwordLabel: "App-specific password",
    passwordHelp: "Sign in to your Apple Account, open Sign-In and Security → App-Specific Passwords, and create one.",
    helpUrl: "https://account.apple.com",
    domains: ["icloud.com", "me.com", "mac.com"],
  },
  other: {
    id: "other",
    name: "Other (IMAP)",
    passwordSupported: true,
    passwordLabel: "Password",
    passwordHelp: "Some providers require an app password instead of your normal one.",
    domains: [],
  },
};

export const IMAP_PORTS = [993, 143] as const;
export const SMTP_PORTS = [465, 587, 25, 2525] as const;

/** Guesses the provider from an address, for pre-selecting the right preset. */
export function providerForAddress(address: string): LinkedProvider {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return LINKED_PROVIDERS.find((p) => PROVIDER_PRESETS[p].domains.includes(domain)) ?? "other";
}
