import { BadRequestException, Injectable } from '@nestjs/common';

export type MessagingSendTextInput = {
  to: string;
  text: string;
  phoneNumberId: string;
  accessToken: string;
};

export type MessagingSendTemplateInput = {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
};

export type MessagingSendMediaInput = {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  mediaType: 'image' | 'document';
  /** Public HTTPS URL Meta can fetch (link-based). Prefer uploadMedia + mediaId for private files. */
  link: string;
  caption?: string;
  filename?: string;
};

export type MessagingUploadMediaInput = {
  phoneNumberId: string;
  accessToken: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type MessagingSendMediaByIdInput = {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  mediaType: 'image' | 'document';
  mediaId: string;
  caption?: string;
  filename?: string;
};

export interface MessagingProvider {
  sendText(input: MessagingSendTextInput): Promise<{ providerMessageId?: string }>;
  sendTemplate(input: MessagingSendTemplateInput): Promise<{ providerMessageId?: string }>;
  sendMedia(input: MessagingSendMediaInput): Promise<{ providerMessageId?: string }>;
  uploadMedia(input: MessagingUploadMediaInput): Promise<{ mediaId: string }>;
  sendMediaById(
    input: MessagingSendMediaByIdInput,
  ): Promise<{ providerMessageId?: string }>;
}

@Injectable()
export class MetaCloudMessagingProvider implements MessagingProvider {
  async sendText(input: MessagingSendTextInput) {
    const digits = input.to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: 'text',
        text: { body: input.text },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp send failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { providerMessageId: data.messages?.[0]?.id };
  }

  async sendTemplate(input: MessagingSendTemplateInput) {
    const digits = input.to.replace(/\D/g, '');
    const components =
      input.bodyParameters?.length
        ? [
            {
              type: 'body',
              parameters: input.bodyParameters.map((text) => ({ type: 'text', text })),
            },
          ]
        : undefined;
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          ...(components ? { components } : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp template send failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { providerMessageId: data.messages?.[0]?.id };
  }

  async sendMedia(input: MessagingSendMediaInput) {
    const digits = input.to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
    const mediaPayload =
      input.mediaType === 'image'
        ? { image: { link: input.link, caption: input.caption } }
        : {
            document: {
              link: input.link,
              caption: input.caption,
              filename: input.filename,
            },
          };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: input.mediaType,
        ...mediaPayload,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp media send failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { providerMessageId: data.messages?.[0]?.id };
  }

  /**
   * Upload a binary to WhatsApp Cloud media (Graph multipart).
   * Use sendMediaById afterward so Meta never needs to fetch our auth-gated files.
   */
  async uploadMedia(input: MessagingUploadMediaInput): Promise<{ mediaId: string }> {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/media`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mimeType);
    form.append(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
      input.fileName,
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp media upload failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (!data.id?.trim()) {
      throw new BadRequestException('WhatsApp media upload returned no media id');
    }
    return { mediaId: data.id };
  }

  async sendMediaById(input: MessagingSendMediaByIdInput) {
    const digits = input.to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`;
    const mediaPayload =
      input.mediaType === 'image'
        ? { image: { id: input.mediaId, caption: input.caption } }
        : {
            document: {
              id: input.mediaId,
              caption: input.caption,
              filename: input.filename,
            },
          };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: input.mediaType,
        ...mediaPayload,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp media send failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { providerMessageId: data.messages?.[0]?.id };
  }

  /** List WABA message templates (APPROVED and others). */
  async listMessageTemplates(input: {
    wabaId: string;
    accessToken: string;
  }): Promise<
    Array<{
      name?: string;
      language?: string;
      status?: string;
      components?: Array<{ type?: string; text?: string }>;
    }>
  > {
    const url = new URL(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(input.wabaId)}/message_templates`,
    );
    url.searchParams.set('limit', '100');
    url.searchParams.set('fields', 'name,language,status,components');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new BadRequestException(
        `WhatsApp template list failed (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        name?: string;
        language?: string;
        status?: string;
        components?: Array<{ type?: string; text?: string }>;
      }>;
    };
    return Array.isArray(data.data) ? data.data : [];
  }
}
