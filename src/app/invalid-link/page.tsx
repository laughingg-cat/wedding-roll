import Link from "next/link";

export default function InvalidLinkPage() {
  return (
    <main className="message-page">
      <h1>This invitation isn’t available.</h1>
      <p>Ask the couple for the current wedding camera link.</p>
      <Link href="/">Return home</Link>
    </main>
  );
}

