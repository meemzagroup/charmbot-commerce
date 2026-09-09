const FORBIDDEN_HOSTS = new Set(["localhost", "localhost.localdomain"]);

export function requirePublicHttpsUrl(raw: string, serviceName: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${serviceName} server URL is invalid`);
  }
  const host = url.hostname.toLowerCase();
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(":");
  const isPrivateName =
    FORBIDDEN_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost");
  if (url.protocol !== "https:" || isIpv4 || isIpv6 || isPrivateName) {
    throw new Error(`${serviceName} server needs a secure public HTTPS hostname`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}