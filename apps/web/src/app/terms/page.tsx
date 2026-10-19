import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <Link href="/" className="text-sm text-brand">← Back</Link>
      <h1 className="text-3xl font-bold">Terms of use</h1>
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">Template for operators: have this reviewed by a lawyer before launch.</p>
      <p className="text-muted">NEXORA Browser Hub is provided as is, without warranties. You are responsible for the websites you visit and the files you download. Private browsing reduces what is stored on your device; it does not make you anonymous to websites, your network, or your employer or school.</p>
      <p className="text-muted">Third-party browser names (Chrome, Firefox, Edge, Brave, Opera, Safari) are trademarks of their respective owners. NEXORA is not affiliated with or endorsed by them.</p>
    </main>
  );
}
