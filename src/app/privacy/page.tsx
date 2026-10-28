import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

// Who runs Leadflow and how to reach them. Google's OAuth consent screen links here.
const OPERATOR = "the Leadflow team";
const CONTACT_EMAIL = "tech@cosmofynd.com";
const UPDATED = "28 October 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[720px] px-4 py-12">
      <h1 className="text-[28px] font-semibold tracking-tight">
        Privacy policy
      </h1>
      <p className="mt-1 text-[14px] text-muted">Last updated {UPDATED}</p>

      <Section title="Who we are">
        <p>
          Leadflow is lead-management software for manufacturers, exporters and
          merchants, run by {OPERATOR}. Companies (our customers) use it to
          collect enquiries from trade shows, email, WhatsApp and their website,
          and to follow up with buyers. Each company&apos;s data is kept
          separate from every other company&apos;s.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account details</strong> for the people who use Leadflow:
            name, work email, role and sign-in records.
          </li>
          <li>
            <strong>Lead details</strong> a company enters or receives: buyer
            names, companies, contact details, business-card photos, voice notes
            and the messages exchanged with them.
          </li>
          <li>
            <strong>Connected mailbox data</strong>, when a company connects its
            Gmail account (see below).
          </li>
          <li>
            <strong>Technical logs</strong> such as request times and errors,
            used to keep the service running and secure.
          </li>
        </ul>
      </Section>

      <Section title="Gmail and Google user data">
        <p>
          A company administrator can connect the company&apos;s Gmail account.
          With their permission we request two Google scopes:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Read email</strong> (<code>gmail.readonly</code>): we read
            new messages that arrive in the inbox after the account is
            connected, so enquiries from buyers can become leads. Messages Gmail
            files under Promotions, Social and Forums are skipped, and older
            mail is not imported.
          </li>
          <li>
            <strong>Send email</strong> (<code>gmail.send</code>): we send
            replies and follow-ups to buyers from the company&apos;s own
            address, only as part of the company&apos;s lead follow-up.
          </li>
        </ul>
        <p>
          The access token Google gives us is stored encrypted. Received email
          content is kept for up to 30 days for processing and then deleted;
          details from an email that becomes a lead (such as the buyer&apos;s
          name, address and message) stay with that lead in the company&apos;s
          account. The text of an email may be passed to an AI model (Google
          Gemini) to extract the buyer&apos;s details; it is not used to train
          any model.
        </p>
        <p>
          We do not sell Google user data, use it for advertising, or let people
          read it except where the company&apos;s own users view their leads,
          where it is needed for security or to comply with the law, or where
          the company asks us to help with a support issue.
        </p>
        <p>
          Leadflow&apos;s use and transfer of information received from Google
          APIs adheres to the{" "}
          <a
            className="text-accent underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          An administrator can disconnect the mailbox at any time in Leadflow,
          or remove access from their Google account at{" "}
          <a
            className="text-accent underline underline-offset-2"
            href="https://myaccount.google.com/permissions"
          >
            myaccount.google.com/permissions
          </a>
          . When a mailbox is disconnected we stop reading and sending, and
          withdraw our access at Google.
        </p>
      </Section>

      <Section title="How we use data">
        <p>
          Only to provide Leadflow to the company that owns the data: capturing
          and organising leads, researching the buyer&apos;s company from public
          sources, drafting and sending follow-ups, and keeping the service
          secure and working.
        </p>
      </Section>

      <Section title="Who processes data for us">
        <p>
          We use service providers to host and run Leadflow: cloud hosting and
          databases (such as Render, Neon, Upstash and Vercel), Google (Gmail
          and Gemini) and Meta (WhatsApp). They process data only to provide
          their service to us.
        </p>
      </Section>

      <Section title="Keeping and deleting data">
        <p>
          A company&apos;s data is kept while it uses Leadflow. When a company
          leaves, its data is deleted and any connected mailboxes are
          disconnected. A company can ask us to delete specific records at any
          time.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests about privacy:{" "}
          <a
            className="text-accent underline underline-offset-2"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
