export type Post = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string[];
};

export const POSTS: Post[] = [
  {
    slug: "3-elements-of-generational-wealth",
    title: "3 Elements of Generational Wealth",
    date: "May 9, 2023",
    excerpt:
      "Building wealth that lasts beyond one lifetime rests on a few durable foundations — ownership, structure, and stewardship.",
    body: [
      "Generational wealth is not simply about accumulating assets; it is about creating structures that allow those assets to survive taxes, transitions, and time. In our real estate and family estates practice, three elements come up again and again.",
      "First is ownership. Owning appreciating assets — particularly real property — remains one of the most reliable ways families build a foundation of wealth. Clear title, sound financing, and thoughtful acquisition set the stage for everything that follows.",
      "Second is structure. Trusts, entities, and estate plans determine whether wealth passes smoothly to the next generation or is eroded by disputes and taxes. The right structure protects both the asset and the family behind it.",
      "Third is stewardship. Wealth endures when the next generation understands how to manage and grow it. Documenting intentions, educating heirs, and revisiting the plan as circumstances change keeps a legacy intact.",
    ],
  },
  {
    slug: "litigation-mediation-or-conversation",
    title: "Litigation, Mediation, or Conversation",
    date: "November 19, 2021",
    excerpt:
      "Not every dispute belongs in a courtroom. Choosing the right path can preserve relationships, time, and money.",
    body: [
      "When a disagreement arises over a property, an estate, or a business, the instinct is often to prepare for a fight. But litigation is only one of several tools, and rarely the first one worth reaching for.",
      "Conversation — a direct, well-prepared negotiation between the parties — resolves more matters than most people expect. When counsel frames the issues clearly and the stakes honestly, many disputes settle before they ever escalate.",
      "Mediation adds a neutral third party who helps both sides find common ground. It is confidential, faster than trial, and keeps decision-making in the hands of the parties rather than a judge.",
      "Litigation remains essential when rights must be vindicated or when the other side will not engage in good faith. The key is choosing the path deliberately — matching the strategy to the goal, not to the emotion of the moment.",
    ],
  },
  {
    slug: "legacy-transactions",
    title: "Legacy Transactions",
    date: "December 3, 2018",
    excerpt:
      "A legacy transaction is more than a closing — it is the transfer of something a family intends to keep for generations.",
    body: [
      "Some transactions are ordinary. Others carry the weight of a family's future. We think of these as legacy transactions — the purchase of a first commercial building, the transfer of a family home, the acquisition of a house of worship.",
      "These deals demand more than standard diligence. They require an understanding of what the asset means to the people involved and how it fits into a longer plan for ownership and succession.",
      "Handled well, a legacy transaction becomes the cornerstone of generational wealth. Handled poorly, it becomes the source of future disputes. The difference lies in the care taken at the outset.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
