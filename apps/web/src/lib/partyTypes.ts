export type Party = {
  id: string;
  displayName: string;
  type: string;
  businessType?: string | null;
  email?: string | null;
  phone?: string | null;
  updatedAt: string;
};

export type PartyDetail = Party & {
  contacts?: Array<{
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    title?: string | null;
    isPrimary?: boolean;
  }>;
  addresses?: Array<{
    id: string;
    label: string;
    line1: string;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }>;
  trips?: Array<{
    id: string;
    tripNumber: string;
    title: string;
    status: string;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  inquiries?: Array<{
    id: string;
    inquiryNumber: string;
    status: string;
    updatedAt: string;
  }>;
};

export function partyHubPath(id: string) {
  return `/parties/${id}`;
}
