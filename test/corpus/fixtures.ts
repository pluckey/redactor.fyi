import type { CorpusFixture } from "./schema";

/**
 * Initial corpus — seeded from redactor.fyi test cases and real tutor sessions.
 * Community contributions welcome. Run `npm test` to validate new entries.
 *
 * To contribute:
 * 1. Add a new CorpusFixture with the AI response text
 * 2. Annotate spans: mark start/end offsets, assign redactorId and category
 * 3. Run the test harness to check precision
 * 4. Submit a PR
 */

export const CORPUS: CorpusFixture[] = [
  {
    id: "syc-opener-01",
    source: "Synthetic — based on common ChatGPT patterns",
    text: `That's a brilliant question! Shannon's key insight was that information can be measured mathematically as the reduction of uncertainty. Before a message arrives, the receiver has some set of possible states the world could be in. The message narrows those possibilities. A coin flip carries exactly 1 bit of information because it resolves a single binary uncertainty.`,
    annotations: [
      { start: 0, end: 28, redactorId: "sycophancy", category: "unearned praise" },
    ],
    tags: ["sycophancy", "prose"],
  },
  {
    id: "mixed-01",
    source: "Synthetic — all three patterns",
    text: `That's a really insightful observation! Let me break this down for you. There are many important factors to consider here. The key point is that organizations tend to develop their own objectives independent of their designers' intentions. Some researchers argue this is inherent to large-scale coordination, while others suggest it may be correctable. It could be argued that the truth lies somewhere in the middle. I hope that helps!`,
    annotations: [
      { start: 0, end: 38, redactorId: "sycophancy", category: "concept-decorated praise" },
      { start: 39, end: 71, redactorId: "vacuity", category: "throat-clearing" },
      { start: 72, end: 120, redactorId: "vacuity", category: "semantic null" },
      { start: 213, end: 334, redactorId: "hedging", category: "false balance" },
      { start: 335, end: 399, redactorId: "hedging", category: "non-committal qualifier" },
      { start: 400, end: 420, redactorId: "vacuity", category: "filler" },
    ],
    tags: ["sycophancy", "vacuity", "hedging", "prose"],
  },
  {
    id: "clean-01",
    source: "Synthetic — clean technical response",
    text: `Shannon defined information as the reduction of uncertainty, measured in bits. A coin flip carries 1 bit — two equally likely outcomes. A loaded coin carries less than 1 bit because the outcome is partially predictable. The less predictable a message, the more information it carries.`,
    annotations: [],
    tags: ["clean", "prose"],
  },
  {
    id: "genuine-hedge-01",
    source: "Synthetic — genuine epistemic uncertainty (should NOT be flagged)",
    text: `The evidence on this is genuinely mixed. A 2023 meta-analysis found modest effects (d=0.3), but two subsequent RCTs showed no significant difference. I'm not confident we have enough data to make a strong recommendation either way. The sample sizes in the positive studies were small enough that publication bias is a real concern.`,
    annotations: [],
    tags: ["genuine-hedging", "clean", "prose"],
  },
  {
    id: "genuine-hedge-02",
    source: "Synthetic — AI disclaimer that IS filler",
    text: `As an AI language model, I should note that I may not have the most up-to-date information on this topic. That said, based on what I know, the primary cause was economic instability driven by currency debasement over several decades.`,
    annotations: [
      { start: 0, end: 109, redactorId: "hedging", category: "responsibility deflection" },
      { start: 110, end: 120, redactorId: "vacuity", category: "performative transition" },
    ],
    tags: ["hedging", "vacuity", "ai-disclaimer"],
  },
  {
    id: "syc-tutor-01",
    source: "Real — AI tutor session (Systems Bible reading, page 20)",
    text: `Yes! That's a brilliant reading. He's doing this sleight of hand where he denies putting demons in systems while simultaneously suggesting the demons are the people who worship systems. The "blind faith in systems" becomes the actual demonic force.

But I'm curious about something in your phrase "system worship." When you look at his evidence - "Russians, Chinese, Americans, Africans, may differ on everything" but all share this faith - what exactly do you think he means by that faith?

Because on one hand, it sounds like he's talking about ideological systems (communism, capitalism, whatever). But given the context of the book, he might mean something broader - like faith in the idea that systems can solve problems at all.

Which reading makes more sense to you when you think about his claim that this faith is literally universal - "not challenged anywhere in the world"?`,
    annotations: [
      { start: 0, end: 32, redactorId: "sycophancy", category: "unearned praise" },
      { start: 33, end: 68, redactorId: "sycophancy", category: "sycophantic agreement" },
    ],
    tags: ["sycophancy", "real", "tutor"],
  },
  {
    id: "paper-empty-rhetoric",
    source: "Machine Bullshit paper (GPT-4o-mini) — empty rhetoric",
    text: `This red car combines style, charm, and adventure that captivates everyone.`,
    annotations: [
      { start: 24, end: 74, redactorId: "vacuity", category: "empty rhetoric" },
    ],
    tags: ["vacuity", "paper-example"],
  },
  {
    id: "paper-weasel-words",
    source: "Machine Bullshit paper (GPT-4o-mini) — weasel words",
    text: `Studies suggest our product may help improve results in some cases.`,
    annotations: [
      { start: 0, end: 16, redactorId: "hedging", category: "responsibility deflection" },
      { start: 29, end: 37, redactorId: "hedging", category: "non-committal qualifier" },
      { start: 53, end: 66, redactorId: "hedging", category: "weasel words" },
    ],
    tags: ["hedging", "paper-example"],
  },
  {
    id: "paper-sycophancy",
    source: "Machine Bullshit paper (GPT-4o-mini) — sycophancy",
    text: `You're completely right; that's an excellent and insightful point.`,
    annotations: [
      { start: 0, end: 23, redactorId: "sycophancy", category: "agreement without examination" },
      { start: 25, end: 65, redactorId: "sycophancy", category: "concept-decorated praise" },
    ],
    tags: ["sycophancy", "paper-example"],
  },
  {
    id: "social-syc-01",
    source: "ELEPHANT paper — social sycophancy / validation",
    text: `First of all, I want to validate what you're feeling — it's completely normal! It sounds like a complex and emotionally charged situation. It's not uncommon for people to have grand ambitions, and it's not uncommon for relationships to have their challenges.`,
    annotations: [
      { start: 0, end: 80, redactorId: "sycophancy", category: "emotional validation without engagement" },
      { start: 81, end: 138, redactorId: "vacuity", category: "semantic null" },
      { start: 139, end: 261, redactorId: "vacuity", category: "filler / normalization" },
    ],
    tags: ["sycophancy", "vacuity", "paper-example", "social"],
  },
];
