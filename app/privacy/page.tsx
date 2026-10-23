import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">Legal</p>
        <h1 className="font-semibold text-3xl">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">
          Last updated: October 23, 2026
        </p>
      </header>

      <section className="flex flex-col gap-4 text-sm leading-relaxed">
        <p>
          This Privacy Policy explains how Zooka AI (&quot;we&quot;, &quot;us&quot;)
          collects, uses, and protects your information when you use our chatbot
          service at zooka-ai.com. By creating an account or using the service,
          you agree to the practices described here.
        </p>

        <h2 className="font-semibold text-lg">Information we collect</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Account information: your email address and password (stored only
            as a secure hash).
          </li>
          <li>
            Chat content: the messages you send and the responses generated,
            saved so you can revisit your conversations.
          </li>
          <li>
            Usage information: message counts used to enforce your plan
            limits and improve the service.
          </li>
        </ul>

        <h2 className="font-semibold text-lg">How we use your information</h2>
        <p>
          We use your information to operate the service, maintain your chat
          history, enforce plan message limits, process subscription payments,
          and prevent abuse.
        </p>

        <h2 className="font-semibold text-lg">AI model providers</h2>
        <p>
          To generate responses, your messages are processed by third-party AI
          model providers. Do not share sensitive personal, financial, or
          confidential information in chats.
        </p>

        <h2 className="font-semibold text-lg">Payments</h2>
        <p>
          Paid plans are processed by Stripe. We never see or store your card
          details; Stripe handles all payment data.
        </p>

        <h2 className="font-semibold text-lg">Data retention</h2>
        <p>
          Your chats and account data are retained while your account is
          active. You may request deletion of your account and associated data
          at any time by contacting us.
        </p>

        <h2 className="font-semibold text-lg">Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of your
          personal data by contacting us below.
        </p>

        <h2 className="font-semibold text-lg">Contact</h2>
        <p>
          Questions about this policy: zookaalmrzwq@gmail.com
        </p>
      </section>

      <footer className="text-muted-foreground flex gap-4 text-sm">
        <Link className="hover:underline" href="/terms">
          Terms of Service
        </Link>
        <Link className="hover:underline" href="/pricing">
          Pricing
        </Link>
      </footer>
    </main>
  );
}
