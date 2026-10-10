/**
 * Static signal tables used by the classifier. They feed a weighted,
 * probabilistic model and are never used as a single decisive rule.
 */

export const SOCIAL_DOMAINS = new Set([
  "facebookmail.com", "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "pinterest.com", "reddit.com", "redditmail.com", "discord.com", "snapchat.com",
  "tumblr.com", "quora.com", "nextdoor.com", "meetup.com", "strava.com", "threads.net",
  "bsky.app", "whatsapp.com", "telegram.org", "youtube.com", "twitch.tv", "medium.com",
]);

export const FORUM_DOMAINS = new Set(["googlegroups.com", "groups.io", "freelists.org", "lists.debian.org", "discoursemail.com"]);

export const UPDATE_DOMAINS = new Set([
  "github.com", "gitlab.com", "atlassian.net", "bitbucket.org", "stripe.com", "paypal.com",
  "vercel.com", "netlify.com", "slack.com", "notion.so", "google.com", "apple.com", "microsoft.com",
]);

export const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly",
  "shorturl.at", "rb.gy", "tiny.cc", "s.id", "t.ly", "lnkd.in",
]);

export const SUSPICIOUS_TLDS = new Set([
  "zip", "mov", "top", "xyz", "click", "gq", "tk", "ml", "cf", "ga", "work", "rest", "fit", "cam",
  "loan", "racing", "win", "bid", "download", "stream", "country", "kim", "men", "date", "faith", "review",
]);

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "aol.com",
  "icloud.com", "me.com", "gmx.com", "gmx.net", "mail.com", "proton.me", "protonmail.com", "yandex.com",
  "libero.it", "virgilio.it", "tiscali.it", "alice.it", "zoho.com",
]);

/** Brand name -> registrable domains that may legitimately use it. */
export const BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com", "paypal.it", "paypal.me"],
  apple: ["apple.com", "icloud.com"],
  microsoft: ["microsoft.com", "outlook.com", "live.com", "office.com", "office365.com", "microsoftonline.com"],
  amazon: ["amazon.com", "amazon.it", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.es", "amazonses.com"],
  netflix: ["netflix.com"],
  google: ["google.com", "gmail.com", "youtube.com"],
  facebook: ["facebook.com", "facebookmail.com", "meta.com"],
  instagram: ["instagram.com", "facebookmail.com"],
  dhl: ["dhl.com", "dhl.it", "dhl.de"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  poste: ["poste.it", "posteitaliane.it"],
  intesa: ["intesasanpaolo.com"],
  unicredit: ["unicredit.it", "unicredit.eu"],
  chase: ["chase.com"],
  "wells fargo": ["wellsfargo.com"],
  "bank of america": ["bankofamerica.com"],
  docusign: ["docusign.com", "docusign.net"],
  dropbox: ["dropbox.com"],
  linkedin: ["linkedin.com"],
  coinbase: ["coinbase.com"],
  binance: ["binance.com"],
};

export const DANGEROUS_EXTENSIONS = new Set([
  "exe", "scr", "pif", "com", "bat", "cmd", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi", "msp", "mst",
  "jar", "ps1", "psm1", "hta", "cpl", "lnk", "reg", "dll", "sys", "app", "gadget", "inf", "scf",
  "application", "msc", "appx", "appxbundle", "msix", "vb", "ws", "sct", "chm", "iso", "img", "vhd", "vhdx",
]);

export const MACRO_EXTENSIONS = new Set(["docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppam", "ppsm", "sldm"]);
export const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "gz", "tgz", "tar", "bz2", "xz", "cab", "ace", "arj"]);
export const HTML_EXTENSIONS = new Set(["htm", "html", "shtml", "xhtml", "svg"]);

type Phrase = { re: RegExp; weight: number };

/** Credential-harvesting / urgency language (English and Italian). */
export const PHISHING_PHRASES: Phrase[] = [
  { re: /verify (your )?(account|identity|email)/i, weight: 0.7 },
  { re: /(account|mailbox) (has been |will be )?(suspended|locked|disabled|deactivated|closed)/i, weight: 0.9 },
  { re: /unusual (sign[- ]?in|login|activity)/i, weight: 0.5 },
  { re: /confirm (your )?(password|identity|billing|payment details)/i, weight: 0.9 },
  { re: /password (will )?expire/i, weight: 0.8 },
  { re: /update (your )?(payment|billing) (information|details|method)/i, weight: 0.7 },
  { re: /within (24|48) hours/i, weight: 0.4 },
  { re: /click (here|below) (immediately|now|to (verify|confirm|unlock|restore))/i, weight: 0.8 },
  { re: /mailbox (is )?(full|over quota)|storage quota exceeded/i, weight: 0.8 },
  { re: /verifica (il tuo|l'|i tuoi) (account|identit|dati)/i, weight: 0.7 },
  { re: /(account|conto|carta) (è stato |è stata |verrà )?(sospes|bloccat|disattivat)/i, weight: 0.9 },
  { re: /conferma (la tua |i tuoi )?(identit|password|dati)/i, weight: 0.8 },
  { re: /aggiorna (i tuoi )?dati (di pagamento|bancari)/i, weight: 0.7 },
];

export const SCAM_PHRASES: Phrase[] = [
  { re: /you (have )?won|congratulations,? you|you are (a|the) (lucky )?winner/i, weight: 1.0 },
  { re: /lottery|jackpot|sweepstake/i, weight: 1.2 },
  { re: /inheritance|next of kin|beneficiary of|unclaimed funds/i, weight: 1.2 },
  { re: /wire transfer|western union|moneygram/i, weight: 0.9 },
  { re: /(processing|release|clearance|transfer) fee|claim (your|the) (prize|funds|reward)/i, weight: 1.0 },
  { re: /gift ?cards?/i, weight: 0.5 },
  { re: /\b(bitcoin|btc|crypto) (wallet|payment|investment)/i, weight: 0.6 },
  { re: /guaranteed (income|returns|profit)|risk[- ]free investment/i, weight: 0.9 },
  { re: /work from home.{0,20}(\$|€)\d/i, weight: 0.7 },
  { re: /hai vinto|vincitore|eredità|lotteria/i, weight: 1.0 },
  { re: /viagra|cialis|weight loss pill/i, weight: 1.2 },
];

export const PROMO_PHRASES: Phrase[] = [
  { re: /\d{1,2}\s?% (off|di sconto)|-\d{1,2}%/i, weight: 0.6 },
  { re: /\b(sale|saldi|black friday|cyber monday|flash sale)\b/i, weight: 0.5 },
  { re: /\b(discount|sconto|coupon|promo code|codice sconto|voucher)\b/i, weight: 0.5 },
  { re: /\b(shop now|buy now|acquista ora|scopri l'offerta|order now)\b/i, weight: 0.5 },
  { re: /\b(free shipping|spedizione gratuita)\b/i, weight: 0.4 },
  { re: /\b(limited time|offerta limitata|last chance|ultima occasione|ends tonight)\b/i, weight: 0.4 },
  { re: /\b(new arrivals|nuovi arrivi|collection|collezione|newsletter)\b/i, weight: 0.3 },
  { re: /\b(deal|deals|offer|offerta|offerte)\b/i, weight: 0.3 },
];

export const UPDATE_PHRASES: Phrase[] = [
  { re: /\b(receipt|ricevuta)\b/i, weight: 0.8 },
  { re: /\b(invoice|fattura)\b/i, weight: 0.8 },
  { re: /\b(your order|il tuo ordine|order (#|no\.?|number)|ordine n)/i, weight: 0.8 },
  { re: /\b(shipped|has shipped|spedit[oa]|out for delivery|in consegna|tracking number)\b/i, weight: 0.7 },
  { re: /\b(confirmation|confirmed|conferma(to|ta)?)\b/i, weight: 0.5 },
  { re: /\b(statement|estratto conto|payment received|pagamento ricevuto)\b/i, weight: 0.6 },
  { re: /\b(reservation|booking|prenotazione|itinerary|itinerario|check-in)\b/i, weight: 0.6 },
  { re: /\b(security alert|avviso di sicurezza|new sign-in|nuovo accesso)\b/i, weight: 0.6 },
  { re: /\b(verification code|codice di verifica|one-time (pass)?code|otp)\b/i, weight: 0.7 },
  { re: /\b(subscription|abbonamento) (renew|rinnov)/i, weight: 0.5 },
  { re: /\b(password reset|reimposta(zione)? (la )?password)\b/i, weight: 0.6 },
  { re: /\b(pull request|merge request|build (failed|passed)|deploy(ment)? (failed|succeeded))\b/i, weight: 0.8 },
];

export const SOCIAL_PHRASES: Phrase[] = [
  { re: /mentioned you|ti ha menzionato/i, weight: 1.0 },
  { re: /commented on|ha commentato/i, weight: 0.8 },
  { re: /new follower|started following you|ha iniziato a seguirti/i, weight: 1.0 },
  { re: /friend request|richiesta di amicizia/i, weight: 1.0 },
  { re: /tagged you|ti ha taggato/i, weight: 1.0 },
  { re: /(invitation|invito) to connect|connection request|wants to connect/i, weight: 0.9 },
  { re: /sent you a message|ti ha inviato un messaggio/i, weight: 0.6 },
  { re: /liked your|reacted to your|ha messo mi piace/i, weight: 0.8 },
];

/** Explicit advertising disclosure (e.g. EU/IT commercial communication labelling). */
export const AD_LABELS: Phrase[] = [
  { re: /^\s*\[(adv|ad|ads|advertisement|pubblicità|pubblicita|promo-adv)\]/i, weight: 2.5 },
  { re: /^\s*(adv|pubblicità|pubblicita|advertisement)\s*[:\-–]/i, weight: 2.5 },
  { re: /\b(sponsored|sponsorizzat[oa]|messaggio pubblicitario|comunicazione commerciale|paid advertisement)\b/i, weight: 1.2 },
];

export const AD_NETWORK_DOMAINS = new Set([
  "doubleclick.net", "googleadservices.com", "googlesyndication.com", "adnxs.com", "awin1.com",
  "tradedoubler.com", "clickbank.net", "impact.com", "rakuten.com", "linksynergy.com", "zanox.com",
  "taboola.com", "outbrain.com", "criteo.com", "adform.net", "rubiconproject.com", "pubmatic.com",
  "admitad.com", "cj.com", "anrdoezrs.net", "dpbolvw.net", "kqzyfj.com", "jdoqocy.com", "tkqlhce.com",
]);

/** Headers set by marketing email service providers. */
export const MARKETING_HEADERS = [
  "x-mailchimp-campaign", "x-mc-user", "x-campaign", "x-campaignid", "x-campaign-id", "x-mailer-campaign",
  "x-klaviyo", "x-sib-id", "x-sendinblue", "x-hubspot", "x-hs-campaign", "x-marketo", "x-mkt",
  "x-sfmc-stack", "x-emarsys", "x-mailjet-campaign", "x-ems", "x-cm-campaign", "x-newsletter",
];

export const FORUM_HEADERS = ["x-mailman-version", "x-google-group-id", "x-discourse-post-id", "x-discourse-topic-id", "list-post", "x-groups-io"];

export function scorePhrases(text: string, phrases: Phrase[], cap: number): { score: number; hits: string[] } {
  let score = 0;
  const hits: string[] = [];
  for (const p of phrases) {
    const m = p.re.exec(text);
    if (m) {
      score += p.weight;
      hits.push(m[0].trim().slice(0, 60));
    }
  }
  return { score: Math.min(score, cap), hits };
}

export function fileExtension(filename: string): string {
  const m = /\.([a-z0-9]{1,12})$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function hasDoubleExtension(filename: string): boolean {
  return /\.(pdf|docx?|xlsx?|jpe?g|png|txt|zip)\.(exe|scr|js|vbs|bat|cmd|com|pif|hta|lnk|jar|msi)$/i.test(filename.trim());
}

export function isDangerousFilename(filename: string): boolean {
  const ext = fileExtension(filename);
  return DANGEROUS_EXTENSIONS.has(ext) || hasDoubleExtension(filename);
}
