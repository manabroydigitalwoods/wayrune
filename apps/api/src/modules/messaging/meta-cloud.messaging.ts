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
  link: string;
  caption?: string;
  filename?: string;
};

export interface MessagingProvider {
  sendText(input: MessagingSendTextInput): Promise<{ providerMessageId?: string }>;
  sendTemplate(input: MessagingSendTemplateInput): Promise<{ providerMessageId?: string }>;
  sendMedia(input: MessagingSendMediaInput): Promise<{ providerMessageId?: string }>;
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
}
