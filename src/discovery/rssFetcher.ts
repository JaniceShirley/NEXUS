import { XMLParser } from 'fast-xml-parser';
import crypto from 'crypto';
import { DiscoveredTopic } from './types.js';

export interface RSSFeedSource {
  name: string;
  url: string;
  type: 'arxiv' | 'github_release' | 'huggingface' | 'rss';
}

export class RSSFetcher {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  private cleanText(raw?: string): string {
    if (!raw) return '';
    return raw
      .replace(/<[^>]*>/g, '') // Strip HTML tags
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  private parseDate(rawDate?: string): string {
    if (!rawDate) return new Date().toISOString();
    const parsed = Date.parse(rawDate);
    return isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  }

  async fetchFeed(source: RSSFeedSource, timeoutMs = 5000): Promise<DiscoveredTopic[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'NEXUS-Autonomous-AI-Agent/1.0 (+https://github.com/Karthik2509-git/NEXUS)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      });

      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`[RSSFetcher] Feed ${source.name} returned HTTP ${response.status}`);
        return [];
      }

      const xmlText = await response.text();
      const parsedXml = this.parser.parse(xmlText);

      const items: DiscoveredTopic[] = [];
      const discoveredAt = new Date().toISOString();

      // Check RSS channel items
      const channelItems = parsedXml?.rss?.channel?.item || parsedXml?.channel?.item;
      // Check Atom entries
      const atomEntries = parsedXml?.feed?.entry;

      const rawItems = Array.isArray(channelItems)
        ? channelItems
        : channelItems
        ? [channelItems]
        : Array.isArray(atomEntries)
        ? atomEntries
        : atomEntries
        ? [atomEntries]
        : [];

      for (const item of rawItems) {
        try {
          const title = this.cleanText(item.title);
          if (!title) continue;

          let link = '';
          if (typeof item.link === 'string') {
            link = item.link;
          } else if (item.link?.['@_href']) {
            link = item.link['@_href'];
          } else if (Array.isArray(item.link)) {
            const alternate = item.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
            link = alternate?.['@_href'] || item.link[0]?.['@_href'] || item.link[0] || '';
          }

          if (!link || typeof link !== 'string') continue;

          // Normalize arxiv links (abs vs pdf)
          if (link.includes('arxiv.org/abs/')) {
            link = link.replace('/abs/', '/abs/');
          }

          const rawSummary = item.description || item.summary || item.content || '';
          const summary = this.cleanText(typeof rawSummary === 'string' ? rawSummary : JSON.stringify(rawSummary));
          const pubDate = this.parseDate(item.pubDate || item.published || item.updated);

          const hashInput = `${source.name}:${link}:${title}`;
          const id = `topic-${crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 12)}`;

          items.push({
            id,
            title,
            summary: summary.substring(0, 1000), // Bound summary size
            url: link,
            publishedAt: pubDate,
            sourceName: source.name,
            sourceType: source.type,
            discoveredAt,
          });
        } catch (itemErr) {
          // Ignore malformed individual items
          continue;
        }
      }

      return items;
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[RSSFetcher] Failed to fetch feed ${source.name}: ${err.message || String(err)}`);
      return [];
    }
  }
}
