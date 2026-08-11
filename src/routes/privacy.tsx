import { createFileRoute } from "@tanstack/react-router";
import { privacyPolicy } from "@/content/privacyPolicy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Jaiff by Unapse LLC" },
      {
        name: "description",
        content:
          "How Jaiff, owned and operated by Unapse LLC, collects, uses, stores, and shares information when you use the app.",
      },
      { property: "og:title", content: "Privacy Policy — Jaiff by Unapse LLC" },
      {
        property: "og:description",
        content:
          "How Jaiff, owned and operated by Unapse LLC, collects, uses, stores, and shares information when you use the app.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-[900px]">
        <header className="border-b border-neutral-200 pb-8">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-base text-neutral-600 sm:text-lg">Jaiff by Unapse LLC</p>
          <p className="mt-4 text-sm text-neutral-500">Last Updated: May 30, 2026</p>
        </header>

        <article className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800 sm:text-base sm:leading-7">
          {privacyPolicy}
        </article>
      </div>
    </main>
  );
}
