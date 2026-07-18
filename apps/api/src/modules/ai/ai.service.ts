import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadEnv } from '@wayrune/config';
import type {
  AssistRewriteInput,
  AssistSummarizeInput,
  GenerateProposalStoryInput,
  ProposalStoryDraft,
} from '@wayrune/contracts';
import {
  ProposalStoryDraftSchema,
  looksLikeIdealSeasonRange,
  pickSeasonalKnowledgeBody,
  tripClimateSeason,
  tripWindowHeadline,
} from '@wayrune/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { PlacesService } from '../places/places.service';

type AssistTranscriptLine = { direction: 'inbound' | 'outbound'; channel: string; text: string };

type PlaceContext = {
  id: string;
  name: string;
  kind: string;
  description?: string;
  bestTime?: string;
  imageUrl?: string;
  knowledge: Array<{ season: string; kind: string; title?: string | null; body: string }>;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private places: PlacesService,
    private prisma: PrismaService,
  ) {}

  status() {
    const env = loadEnv();
    return {
      openaiConfigured: Boolean(env.openaiApiKey),
      model: env.openaiApiKey ? env.openaiModel : null,
    };
  }

  async generateProposalStory(
    organizationId: string,
    input: GenerateProposalStoryInput,
  ): Promise<{
    story: ProposalStoryDraft;
    provenance: 'openai' | 'catalog';
    model?: string;
  }> {
    const contexts = await this.loadPlaceContexts(organizationId, input.placeIds);
    if (!contexts.length) {
      throw new BadRequestException('No usable places found for story draft');
    }

    const catalog = this.assembleFromCatalog(contexts, input);
    const env = loadEnv();
    const preferAi = input.preferAi !== false;

    if (!preferAi || !env.openaiApiKey) {
      return { story: catalog, provenance: 'catalog' };
    }

    try {
      const aiDraft = await this.draftWithOpenAi(contexts, input, env.openaiApiKey, env.openaiModel);
      return {
        story: {
          ...catalog,
          ...aiDraft,
          // Never invent hero URLs — always prefer catalog photos.
          heroImageUrl: catalog.heroImageUrl || aiDraft.heroImageUrl,
        },
        provenance: 'openai',
        model: env.openaiModel,
      };
    } catch (err) {
      this.logger.warn(
        `OpenAI proposal-story failed, falling back to catalog: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { story: catalog, provenance: 'catalog' };
    }
  }

  /** Rewrite a draft reply — polish tone/grammar without inventing new facts. */
  async rewrite(input: AssistRewriteInput): Promise<{ text: string; provenance: 'openai' | 'stub' }> {
    const env = loadEnv();
    if (env.openaiApiKey) {
      try {
        const text = await this.rewriteWithOpenAi(input, env.openaiApiKey, env.openaiModel);
        return { text, provenance: 'openai' };
      } catch (err) {
        this.logger.warn(
          `OpenAI rewrite failed, falling back to stub: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { text: this.stubRewrite(input), provenance: 'stub' };
  }

  /** Summarize a conversation (by interaction ids, or the last touches for a party). */
  async summarize(
    organizationId: string,
    input: AssistSummarizeInput,
  ): Promise<{ summary: string; messageCount: number; provenance: 'openai' | 'stub' }> {
    const lines = await this.loadTranscript(organizationId, input);
    if (!lines.length) {
      throw new BadRequestException('Nothing to summarize for this conversation');
    }

    const env = loadEnv();
    if (env.openaiApiKey) {
      try {
        const summary = await this.summarizeWithOpenAi(lines, env.openaiApiKey, env.openaiModel);
        return { summary, messageCount: lines.length, provenance: 'openai' };
      } catch (err) {
        this.logger.warn(
          `OpenAI summarize failed, falling back to stub: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { summary: this.stubSummarize(lines), messageCount: lines.length, provenance: 'stub' };
  }

  private async loadTranscript(
    organizationId: string,
    input: AssistSummarizeInput,
  ): Promise<AssistTranscriptLine[]> {
    const rows = input.interactionIds?.length
      ? await this.prisma.interaction.findMany({
          where: { organizationId, id: { in: input.interactionIds } },
          orderBy: { occurredAt: 'asc' },
          take: 100,
        })
      : input.conversationId
        ? await this.prisma.interaction.findMany({
            where: { organizationId, conversationId: input.conversationId },
            orderBy: { occurredAt: 'asc' },
            take: 100,
          })
        : input.partyId
          ? await this.prisma.interaction.findMany({
              where: { organizationId, partyId: input.partyId },
              orderBy: { occurredAt: 'desc' },
              take: 30,
            })
          : [];
    const ordered =
      input.partyId && !input.interactionIds?.length && !input.conversationId
        ? rows.slice().reverse()
        : rows;
    return ordered
      .map((row) => {
        const raw = (row.rawPayloadJson ?? {}) as Record<string, unknown>;
        const text =
          (typeof raw.text === 'string' && raw.text.trim()) ||
          row.summary?.trim() ||
          '';
        if (!text) return null;
        return {
          direction: raw.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
          channel: row.channel,
          text,
        };
      })
      .filter((l): l is AssistTranscriptLine => Boolean(l));
  }

  private stubRewrite(input: AssistRewriteInput): string {
    const trimmed = input.text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return trimmed;
    const sentence = trimmed[0]!.toUpperCase() + trimmed.slice(1);
    const withPunctuation = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    switch (input.tone) {
      case 'formal':
        return `Dear traveller, ${withPunctuation.charAt(0).toLowerCase()}${withPunctuation.slice(1)} Kind regards.`;
      case 'concise':
        return withPunctuation.replace(/\s*\([^)]*\)/g, '');
      case 'persuasive':
        return `${withPunctuation} We'd love to help make this happen for you!`;
      case 'friendly':
      default:
        return `Hi! ${withPunctuation} Let us know if you have any questions 🙂`;
    }
  }

  private stubSummarize(lines: AssistTranscriptLine[]): string {
    const last = lines[lines.length - 1];
    const inbound = lines.filter((l) => l.direction === 'inbound').length;
    const outbound = lines.length - inbound;
    const channels = [...new Set(lines.map((l) => l.channel))].join(', ');
    const preview = last.text.length > 160 ? `${last.text.slice(0, 157)}…` : last.text;
    return [
      `${lines.length} message${lines.length === 1 ? '' : 's'} on ${channels} (${inbound} from customer, ${outbound} from team).`,
      `Most recent: "${preview}"`,
    ].join(' ');
  }

  private async rewriteWithOpenAi(
    input: AssistRewriteInput,
    apiKey: string,
    model: string,
  ): Promise<string> {
    const system = [
      'You rewrite draft customer-service replies for a travel agency.',
      'Preserve all facts, names, dates, and prices exactly as given — never invent new ones.',
      'Fix grammar and adjust tone only.',
      `Target tone: ${input.tone || 'friendly'}.`,
      'Reply with the rewritten message only, no preamble, no quotes.',
    ].join(' ');
    const content = await this.chatCompletion(system, input.text, apiKey, model);
    return content.trim();
  }

  private async summarizeWithOpenAi(
    lines: AssistTranscriptLine[],
    apiKey: string,
    model: string,
  ): Promise<string> {
    const transcript = lines
      .map((l) => `${l.direction === 'outbound' ? 'Agent' : 'Customer'} (${l.channel}): ${l.text}`)
      .join('\n');
    const system = [
      'Summarize this customer conversation for a travel agency salesperson picking it up.',
      'Cover: what the customer wants, key facts (dates/destinations/budget), and any open question.',
      'Keep it to 2-4 short sentences. No markdown.',
    ].join(' ');
    const content = await this.chatCompletion(system, transcript, apiKey, model);
    return content.trim();
  }

  private async chatCompletion(system: string, user: string, apiKey: string, model: string) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `OpenAI error ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      );
    }
    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      throw new ServiceUnavailableException('OpenAI returned empty content');
    }
    return content;
  }

  private async loadPlaceContexts(
    organizationId: string,
    placeIds: string[],
  ): Promise<PlaceContext[]> {
    const out: PlaceContext[] = [];
    for (const id of placeIds.slice(0, 12)) {
      try {
        const place = await this.places.getById(organizationId, id);
        const profile =
          place.profile && typeof place.profile === 'object'
            ? (place.profile as {
                description?: string;
                bestTime?: string;
                imageUrls?: string[];
              })
            : {};
        out.push({
          id: place.id,
          name: place.name,
          kind: place.kind,
          description: profile.description?.trim() || undefined,
          bestTime: profile.bestTime?.trim() || undefined,
          imageUrl: profile.imageUrls?.find((u) => u?.trim())?.trim(),
          knowledge: (place.knowledge || []).map((k: {
            season: string;
            kind: string;
            title?: string | null;
            body: string;
          }) => ({
            season: k.season,
            kind: k.kind,
            title: k.title,
            body: k.body,
          })),
        });
      } catch {
        /* skip inaccessible places */
      }
    }
    return out;
  }

  private assembleFromCatalog(
    places: PlaceContext[],
    input: GenerateProposalStoryInput,
  ): ProposalStoryDraft {
    const names =
      input.placeNames?.filter(Boolean).length
        ? [...new Set(input.placeNames.filter(Boolean))]
        : places.map((p) => p.name);
    const lead = names[0] as string | undefined;
    const others = names.slice(1) as string[];
    const leadPlace =
      (lead
        ? places.find((p) => p.name.toLowerCase() === lead.toLowerCase())
        : undefined) || places[0];

    const season = tripClimateSeason(input.startDate, input.endDate);
    const knowledge = places.flatMap((p) => p.knowledge);
    const weather = pickSeasonalKnowledgeBody(knowledge, 'weather', season);
    const tip = pickSeasonalKnowledgeBody(knowledge, 'tip', season);
    const packingBody = pickSeasonalKnowledgeBody(knowledge, 'packing', season);

    const packingTips = packingBody
      ? packingBody
          .split(/[\n;]+/)
          .map((s) => s.replace(/^[-•\s]+/, '').trim())
          .filter((s) => s.length > 2)
          .slice(0, 8)
      : undefined;

    const packingCategories = this.categorizePackingTips(packingTips);

    const highlights: string[] = [];
    if (tip) {
      for (const bit of tip.split(/[\n;]+/).map((s) => s.trim()).filter((s) => s.length > 8)) {
        highlights.push(bit.length > 100 ? `${bit.slice(0, 97)}…` : bit);
        if (highlights.length >= 4) break;
      }
    }
    for (const name of names.slice(0, 4)) {
      const line = `Explore ${name}`;
      if (!highlights.some((h) => h.toLowerCase() === line.toLowerCase())) {
        highlights.push(line);
      }
    }

    return {
      heroImageUrl: places.map((p) => p.imageUrl).find(Boolean),
      headline: lead
        ? others.length
          ? `Discover ${lead}${others.length === 1 ? ` & ${others[0]}` : ' and beyond'}`
          : `Escape to ${lead}`
        : undefined,
      tagline:
        leadPlace?.description ||
        (names.length > 1
          ? `${names.join(' · ')} — curated days for your travellers`
          : lead
            ? `A thoughtfully paced stay in ${lead}`
            : undefined),
      // Travel window for this trip — not catalog ideal season ("October–May").
      bestTime: tripWindowHeadline(input.startDate, input.endDate, lead || null),
      weatherNote: weather || tip?.slice(0, 180),
      highlights: highlights.slice(0, 6),
      packingTips,
      packingCategories,
      consultantNote: lead
        ? `Looking forward to hosting your travellers in ${lead}.`
        : undefined,
    };
  }

  private categorizePackingTips(tips?: string[]): ProposalStoryDraft['packingCategories'] {
    if (!tips?.length) return undefined;
    const clothing: string[] = [];
    const electronics: string[] = [];
    const documents: string[] = [];
    const medicine: string[] = [];
    const clothingRe =
      /\b(jacket|layer|shoes|boots|socks|clothes|clothing|sweater|thermals?|gloves|hat|cap|umbrella|rain|wool|warm)\b/i;
    const electronicsRe =
      /\b(power|bank|charger|camera|phone|adapter|battery|headphone|cable|kindle)\b/i;
    const documentsRe =
      /\b(passport|id|identity|voucher|ticket|visa|permit|insurance|document)\b/i;
    const medicineRe =
      /\b(meds?|medicine|tablet|altitude|first.?aid|sunscreen|insect|repellent|cream)\b/i;
    for (const tip of tips) {
      if (medicineRe.test(tip)) medicine.push(tip);
      else if (documentsRe.test(tip)) documents.push(tip);
      else if (electronicsRe.test(tip)) electronics.push(tip);
      else if (clothingRe.test(tip)) clothing.push(tip);
      else clothing.push(tip);
    }
    const cats = { clothing, electronics, documents, medicine };
    if (!Object.values(cats).some((list) => list.length)) return undefined;
    return cats;
  }

  private async draftWithOpenAi(
    places: PlaceContext[],
    input: GenerateProposalStoryInput,
    apiKey: string,
    model: string,
  ): Promise<ProposalStoryDraft> {
    const context = {
      tripTitle: input.tripTitle || null,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      nights: input.nights || null,
      destinations: places.map((p) => ({
        name: p.name,
        kind: p.kind,
        description: p.description || null,
        bestTime: p.bestTime || null,
        knowledge: p.knowledge.slice(0, 12).map((k) => ({
          kind: k.kind,
          season: k.season,
          title: k.title,
          body: k.body.slice(0, 500),
        })),
      })),
    };

    const system = [
      'You are a senior travel consultant writing a customer-facing Living Proposal story.',
      'Use ONLY facts present in the destination context (descriptions, knowledge notes).',
      'Do not invent hotel names, prices, flights, or attractions that are not implied by the context.',
      'Emotional headline/tagline may paraphrase, but must stay true to the destinations.',
      'bestTime must be a short label for THIS trip travel window using startDate/endDate',
      '(e.g. "July in Darjeeling" or "During your October trip") — NEVER a generic ideal season range like "October–May".',
      'weatherNote must describe what guests should expect / what is lovely during those travel dates',
      '(clarity, rain, chill, packing cue) using matching seasonal knowledge; if unknown, give a cautious note for that month.',
      'For packingCategories, suggest practical short checklist items for this destination and travel season',
      '(clothing, electronics, documents, medicine) — 2-5 items each, grounded in weather/packing knowledge when present.',
      'Also include packingTips as a short flat fallback list (3-6 items).',
      'Return a single JSON object with keys:',
      'headline, tagline, highlights (3-6 short strings), bestTime, weatherNote, consultantNote,',
      'packingTips (string array), packingCategories ({ clothing, electronics, documents, medicine: string arrays }).',
      'No markdown, no prose outside JSON.',
    ].join(' ');

    const user = `Draft the proposal story JSON for travellers on these dates (ground weather in the travel window):\n${JSON.stringify(context)}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `OpenAI error ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      );
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw?.trim()) {
      throw new ServiceUnavailableException('OpenAI returned empty content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException('OpenAI returned non-JSON content');
    }

    const draft = ProposalStoryDraftSchema.safeParse(parsed);
    if (!draft.success) {
      throw new ServiceUnavailableException('OpenAI JSON did not match story shape');
    }
    const data = draft.data;
    const leadName = places[0]?.name;
    const windowHeadline = tripWindowHeadline(
      input.startDate,
      input.endDate,
      leadName || null,
    );
    const bestTime =
      !data.bestTime?.trim() || looksLikeIdealSeasonRange(data.bestTime)
        ? windowHeadline
        : data.bestTime;
    const normalized: ProposalStoryDraft = {
      ...data,
      bestTime,
    };
    if (!normalized.packingCategories && normalized.packingTips?.length) {
      return {
        ...normalized,
        packingCategories: this.categorizePackingTips(normalized.packingTips),
      };
    }
    return normalized;
  }
}
