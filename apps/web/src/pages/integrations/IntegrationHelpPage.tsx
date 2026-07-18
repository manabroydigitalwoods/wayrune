import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOrgNavigate } from '../../hooks/useOrgNavigate';
import { BookOpen, ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  PageHeader,
  SuggestionChips,
} from '@wayrune/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { AGENCY_ROUTES } from '../../lib/agencyRoutes';

type GuideId =
  | 'overview'
  | 'google_workspace'
  | 'whatsapp'
  | 'facebook_leads'
  | 'instagram_leads'
  | 'conversation_widget'
  | 'webhook'
  | 'email_ingest'
  | 'hubspot';

const GUIDES: { id: GuideId; label: string }[] = [
  { id: 'overview', label: 'Start here' },
  { id: 'google_workspace', label: 'Google Workspace' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'facebook_leads', label: 'Facebook' },
  { id: 'instagram_leads', label: 'Instagram' },
  { id: 'conversation_widget', label: 'Chatflows' },
  { id: 'webhook', label: 'Website form webhook' },
  { id: 'email_ingest', label: 'Email ingest' },
  { id: 'hubspot', label: 'HubSpot' },
];

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-foreground">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function GuideBody({ id }: { id: GuideId }) {
  const { toOrgPath } = useOrgNavigate();
  switch (id) {
    case 'overview':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Integrations connect your agency tools (WhatsApp, Google, Facebook, your website) to
            this app so customer messages land in one place: the <strong className="text-foreground">Inbox</strong>.
          </p>
          <p>
            Important idea: a new chat, form fill, or review usually becomes a{' '}
            <strong className="text-foreground">conversation touch</strong> first — not an automatic
            Lead or Trip. Your team decides in Inbox whether to turn it into a travel request.
          </p>
          <ol className="space-y-3">
            <Step n={1}>
              Open <Link className="text-foreground underline" to={toOrgPath(AGENCY_ROUTES.settingsIntegrations)}>Settings → Integrations</Link>.
            </Step>
            <Step n={2}>Pick a connector and click Configure.</Step>
            <Step n={3}>Follow the guide below for that connector (connect → test → day-to-day use).</Step>
          </ol>
          <p>
            You do not need to create your own Google Cloud or Meta “developer project” for Google
            Workspace Connect. For WhatsApp / Facebook you still paste tokens from Meta’s app that
            your agency (or Wayrune) set up.
          </p>
        </div>
      );

    case 'google_workspace':
      return (
        <div className="space-y-5 text-sm leading-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">Google Workspace</strong> is one “Connect Google”
            button for Business Profile (reviews & messages), Calendar, Drive file storage, and
            Sheets. Staff “Sign in with Google” on the login page is separate — that is configured
            once for the whole Wayrune platform, not per agency.
          </p>
          <h3 className="text-sm font-semibold text-foreground">How to connect</h3>
          <ol className="space-y-3">
            <Step n={1}>Go to Integrations → Google Workspace → Configure.</Step>
            <Step n={2}>Click <strong className="text-foreground">Connect Google</strong>. Sign in with the Google account that owns your Business Profile / Drive.</Step>
            <Step n={3}>Allow the permissions screen (offline access). You should return to Integrations with “Connected” and your email shown.</Step>
            <Step n={4}>If something fails, ask your admin to confirm Google OAuth is set on the server — you still only click Connect; you do not create a Google Cloud project yourself.</Step>
          </ol>

          <h3 className="text-sm font-semibold text-foreground">End-to-end: Google reviews → Inbox</h3>
          <ol className="space-y-3">
            <Step n={1}>After Connect, click <strong className="text-foreground">List locations</strong>, tick your shop/office location(s), then <strong className="text-foreground">Save bound locations</strong>.</Step>
            <Step n={2}>Click <strong className="text-foreground">Sync reviews now</strong> (or wait for a new review / use the ingest webhook for a test message).</Step>
            <Step n={3}>Open <Link className="text-foreground underline" to={toOrgPath(AGENCY_ROUTES.inbox)}>Inbox</Link> and filter channel <strong className="text-foreground">Google Business</strong>.</Step>
            <Step n={4}>You should see a touch with the star rating and comment. No Lead is created yet — claim it, reply if allowed, or convert to a travel request when ready.</Step>
          </ol>

          <h3 className="text-sm font-semibold text-foreground">End-to-end: Calendar follow-ups</h3>
          <ol className="space-y-3">
            <Step n={1}>Leave <strong className="text-foreground">Sync follow-ups to Google Calendar</strong> on (default).</Step>
            <Step n={2}>Create a Task with a due date (from Inbox follow-up or Tasks page).</Step>
            <Step n={3}>Open Google Calendar — you should see an event for that follow-up. Setting travel request start/end dates can also create a calendar window.</Step>
            <Step n={4}>Disconnect Google (or turn the toggle off) to stop new syncs.</Step>
          </ol>

          <h3 className="text-sm font-semibold text-foreground">End-to-end: Drive as your file cupboard</h3>
          <ol className="space-y-3">
            <Step n={1}>In Google Workspace settings, turn on <strong className="text-foreground">Use Google Drive as file storage</strong>.</Step>
            <Step n={2}>The first upload creates a folder named like “Your Agency — Wayrune” in that Google account’s Drive.</Step>
            <Step n={3}>Upload a trip photo, activity attachment, or use <strong className="text-foreground">Save to Drive</strong> on a quotation PDF. The file appears in Drive and stays openable inside the app.</Step>
            <Step n={4}>Optional: Export Inbox to Sheets from the same panel, or import a Sheet range as new Inbox touches (still not automatic Leads).</Step>
          </ol>
        </div>
      );

    case 'whatsapp':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Customer WhatsApp messages appear in Inbox as channel <strong className="text-foreground">WhatsApp</strong>.
            You (or your IT partner) configure Meta WhatsApp Cloud API once, then paste IDs/tokens here.
          </p>
          <h3 className="text-sm font-semibold text-foreground">How to connect</h3>
          <ol className="space-y-3">
            <Step n={1}>In Meta, create/open a WhatsApp Business app and get Phone number ID, access token, verify token, and app secret.</Step>
            <Step n={2}>Integrations → WhatsApp → Enable → paste those values → Save.</Step>
            <Step n={3}>In Meta webhooks, paste the callback URL shown on the panel and the same verify token.</Step>
          </ol>
          <h3 className="text-sm font-semibold text-foreground">End-to-end test</h3>
          <ol className="space-y-3">
            <Step n={1}>Send a WhatsApp message to your business number from a personal phone.</Step>
            <Step n={2}>Open Inbox → filter WhatsApp — the message should appear as a pending touch.</Step>
            <Step n={3}>Reply from Inbox (when WhatsApp is enabled). The customer should get your reply on WhatsApp.</Step>
            <Step n={4}>When ready, convert the conversation into a travel request — the app does not invent a Lead by itself from the chat.</Step>
          </ol>
        </div>
      );

    case 'facebook_leads':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Facebook Lead Ads send form fills into Inbox as channel <strong className="text-foreground">Facebook</strong>.
          </p>
          <ol className="space-y-3">
            <Step n={1}>In Meta, set up Lead Ads for your Page and note Page ID, access token, verify token, app secret.</Step>
            <Step n={2}>Integrations → Facebook Lead Ads → Enable → paste credentials → Save.</Step>
            <Step n={3}>Point Meta’s leadgen webhook at the callback URL shown on the panel.</Step>
            <Step n={4}>Submit a test lead form → check Inbox (Facebook filter) → claim and turn into a travel request when you want.</Step>
          </ol>
        </div>
      );

    case 'instagram_leads':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Instagram uses the same Meta connection as Facebook. Add your Instagram Business Account ID
            on the Facebook panel to also receive DMs as channel <strong className="text-foreground">Instagram</strong>.
          </p>
          <ol className="space-y-3">
            <Step n={1}>Configure Facebook Lead Ads first (same Meta app).</Step>
            <Step n={2}>Enter Instagram Business Account ID on that panel → Save.</Step>
            <Step n={3}>Send a DM to the business Instagram → open Inbox → Instagram filter → reply from Inbox when enabled.</Step>
          </ol>
        </div>
      );

    case 'conversation_widget':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Chatflows live under Settings → Inbox → Chat, not Integrations. Create multiple
            chatflows, assign one per website, and see which chatflow each Inbox message came from.
          </p>
          <ol className="space-y-3">
            <Step n={1}>
              Settings → Inbox → Chat → Manage chatflows → create a chatflow (branding + public key)
              → Save.
            </Step>
            <Step n={2}>
              Digital Presence → Website settings → Chat → assign that chatflow → Save → Publish.
            </Step>
            <Step n={3}>
              Optional: copy the embed snippet from the chatflow editor for non-Presence sites.
            </Step>
            <Step n={4}>
              Send a test message → open Inbox (Website channel) and confirm the chatflow name /
              site / path on the touch.
            </Step>
          </ol>
        </div>
      );

    case 'webhook':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            For custom website forms or tools that can POST JSON. Same idea as the widget: touches
            land in Inbox.
          </p>
          <ol className="space-y-3">
            <Step n={1}>Integrations → Inbox webhook → set a shared secret → Save.</Step>
            <Step n={2}>Give your developer the ingest URL and secret header.</Step>
            <Step n={3}>Submit a test form → see the touch in Inbox → work it like any other channel.</Step>
          </ol>
        </div>
      );

    case 'email_ingest':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Forwarding tools (or a mail parser) can POST emails into Inbox as channel{' '}
            <strong className="text-foreground">Email</strong>.
          </p>
          <ol className="space-y-3">
            <Step n={1}>Integrations → Email ingest → Enable → set shared secret → Save.</Step>
            <Step n={2}>Configure your forwarder to hit the URL on the panel with that secret.</Step>
            <Step n={3}>Send a test email → Inbox → Email filter → reply by email from Inbox when SMTP is configured.</Step>
          </ol>
        </div>
      );

    case 'hubspot':
      return (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Optional CRM sync: when you create Leads in this app, they can be pushed to HubSpot as
            contacts. This does not replace Inbox.
          </p>
          <ol className="space-y-3">
            <Step n={1}>Create a HubSpot private app token with contact write access.</Step>
            <Step n={2}>Integrations → HubSpot → Enable → paste token (and portal id if shown) → Save.</Step>
            <Step n={3}>Create or promote a Lead in the app → check HubSpot for the new contact.</Step>
          </ol>
        </div>
      );

    default:
      return null;
  }
}

export function IntegrationHelpPage() {
  useDocumentTitle('Integration help');
  const { toOrgPath } = useOrgNavigate();
  const [guide, setGuide] = useState<GuideId>('overview');
  const title = useMemo(
    () => GUIDES.find((g) => g.id === guide)?.label ?? 'Help',
    [guide],
  );

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Integration help"
        subtitle="Plain-language guides: how to connect each tool and run a full test from start to finish."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={toOrgPath(AGENCY_ROUTES.settingsIntegrations)}>
              Back to Integrations
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="mt-4 space-y-4">
        <SuggestionChips
          aria-label="Help topics"
          allowDeselect={false}
          options={GUIDES.map((g) => ({ value: g.id, label: g.label }))}
          value={guide}
          onChange={(value) => setGuide((value || 'overview') as GuideId)}
        />

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <GuideBody id={guide} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
