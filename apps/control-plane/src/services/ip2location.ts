import { env } from '@/env';

interface Ip2LocationResponse {
  asn?: string;
  as?: string;
}

export async function lookupAsn(ip: string): Promise<string | null> {
  if (!env.IP2LOCATION_API_KEY) return null;

  try {
    const url = `https://api.ip2location.io/?key=${env.IP2LOCATION_API_KEY}&ip=${encodeURIComponent(ip)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = (await response.json()) as Ip2LocationResponse;
    if (!data.asn) return null;

    const asnStr = data.asn.startsWith('AS') ? data.asn : `AS${data.asn}`;
    return data.as ? `${asnStr} ${data.as}` : asnStr;
  } catch {
    return null;
  }
}
