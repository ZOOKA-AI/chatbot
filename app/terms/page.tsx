import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">Legal</p>
        <h1 className="font-semibold text-3xl">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">
          Last updated: October 23, 2026
        </p>
      </header>

      <section className="flex flex-col gap-4 text-sm leading-relaxed">
        <p>
          These Terms govern your use of the Zooka AI chatbot service at
          zooka-ai.com. By creating an account or using the service, you
          accept these terms.
        </p>

        <h2 className="font-semibold text-lg">The service</h2>
        <p>
          Zooka AI provides AI-powered chatbot conversations. Message limits
          depend on your plan: Free (1,000 messages per month), Pro ($19 per
          month, 10,000 messages), and Business ($49 per month, 100,000
          messages).
        </p>

        <h2 className="font-semibold text-lg">Your account</h2>
        <p>
          You are responsible for keeping your credentials safe and for
          activity under your account. You must provide accurate information
          when registering.
        </p>

        <h2 className="font-semibold text-lg">Acceptable use</h2>
        <p>
          You may not use the service for illegal purposes, to generate
          harmful or abusive content, to attempt to bypass plan limits, or to
          disrupt the service. We may suspend accounts that violate these
          rules.
        </p>

        <h2 className="font-semibold text-lg">Subscriptions and billing</h2>
        <p>
          Paid plans renew monthly until cancelled. Payments are processed by
          Stripe. You can cancel at any time; access to paid features
          continues until the end of the paid period.
        </p>

        <h2 className="font-semibold text-lg">AI output disclaimer</h2>
        <p>
          AI responses may be inaccurate or incomplete. Do not rely on them
          for professional, medical, legal, or financial decisions.
        </p>

        <h2 className="font-semibold text-lg">Limitation of liability</h2>
        <p>
          The service is provided &quot;as is&quot; without warranties. To the
          maximum extent permitted by law, Zooka AI is not liable for indirect
          or consequential damages arising from use of the service.
        </p>

        <h2 className="font-semibold text-lg">Changes</h2>
        <p>
          We may update these terms; material changes will be reflected in the
          date above. Continued use after changes means you accept them.
        </p>

        <h2 className="font-semibold text-lg">Contact</h2>
        <p>Questions about these terms: zookaalmrzwq@gmail.com</p>
      </section>

      <footer className="text-muted-foreground flex gap-4 text-sm">
        <Link className="hover:underline" href="/privacy">
          Privacy Policy
        </Link>
        <Link className="hover:underline" href="/pricing">
          Pricing
        </Link>
      </footer>
    </main>
  );
}
