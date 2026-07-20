/** Map Meta message_templates Graph rows → WhatsAppTemplate upserts. */

export type MetaMessageTemplateRow = {
  name?: string;
  language?: string;
  status?: string;
  components?: Array<{
    type?: string;
    text?: string;
    example?: { body_text?: string[][] };
  }>;
};

export type WhatsAppTemplateSyncUpsert = {
  name: string;
  metaTemplateName: string;
  languageCode: string;
  bodyPreview: string | null;
  variableCount: number;
  isActive: boolean;
};

export function countTemplateBodyVariables(text: string | null | undefined): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

export function mapMetaMessageTemplate(
  row: MetaMessageTemplateRow,
): WhatsAppTemplateSyncUpsert | null {
  const metaTemplateName = row.name?.trim() || '';
  if (!metaTemplateName) return null;
  const languageCode = (row.language?.trim() || 'en').slice(0, 16);
  const body = row.components?.find(
    (c) => String(c.type || '').toUpperCase() === 'BODY',
  );
  const bodyPreview = body?.text?.trim() || null;
  const status = String(row.status || '').toUpperCase();
  return {
    name: `${metaTemplateName} (${languageCode})`,
    metaTemplateName,
    languageCode,
    bodyPreview,
    variableCount: countTemplateBodyVariables(bodyPreview),
    isActive: status === 'APPROVED' || status === '',
  };
}

export function matchExistingWhatsAppTemplate<
  T extends { id: string; metaTemplateName: string; languageCode: string },
>(
  existing: T[],
  metaTemplateName: string,
  languageCode: string,
): T | undefined {
  const meta = metaTemplateName.trim().toLowerCase();
  const lang = languageCode.trim().toLowerCase();
  return existing.find(
    (r) =>
      r.metaTemplateName.trim().toLowerCase() === meta &&
      r.languageCode.trim().toLowerCase() === lang,
  );
}
