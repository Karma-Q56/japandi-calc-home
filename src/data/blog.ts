// Launch blog posts. Plain data, browser safe, no markdown parser needed:
// each post is a list of sections with paragraphs. Keep the wording in plain
// South African English with no em dashes. Dates are ISO publish dates.

export interface BlogSection {
  heading: string;
  paragraphs: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  readMinutes: number;
  /** True only after the owner has read and approved the final copy. */
  reviewed?: boolean;
  excerpt: string;
  sections: BlogSection[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "why-the-card-still-works",
    title: "Why a card on the counter still works",
    date: "2026-10-28",
    readMinutes: 4,
    excerpt:
      "Apps come and go, but a visible card that fills up keeps bringing people back. The research behind the humble punch card, and how Patron puts it on your phone.",
    sections: [
      {
        heading: "You can see the gap",
        paragraphs: [
          "A loyalty card works because you can see it filling up. Six stamps in, four to go, and suddenly a Tuesday sandwich includes a visit to your counter. Researchers call it the goal gradient effect: people move faster when the reward is in sight.",
          "That is also why a card hidden inside an app with a login screen loses most of its power. If the guest cannot see the gap, there is no pull.",
        ],
      },
      {
        heading: "The card without the cardboard",
        paragraphs: [
          "Patron keeps the card idea and drops the login. A QR code at the till opens the guest's card in their browser in one scan. No app to download, no password to forget, and the stamps sit right there, filling towards the reward you chose.",
          "The restaurant still sees something the cardboard never gave you: which guests are one stamp away, which ones have not been back in a month, and how many visits a week your card is pulling.",
        ],
      },
      {
        heading: "Where to start",
        paragraphs: [
          "Pick a reward the guest actually wants and can reach in eight to ten visits. Anything further away and the goal gradient is too weak to change a habit. Then print the QR pack and put it where the till meets the guest.",
          "You can read the study on the goal gradient effect from Columbia Business School (2006) here: https://www.columbia.edu/~rk566/Session4/Goal-Gradient_Illusionary_Goal_Progress.pdf",
        ],
      },
    ],
  },
  {
    slug: "work-your-quiet-day",
    title: "Work your quiet day",
    date: "2026-10-21",
    readMinutes: 3,
    excerpt:
      "Every cafe has a Tuesday nobody wants. A double stamp day aimed at the quiet day fills it without discounting your busy Saturday.",
    sections: [
      {
        heading: "Discounts tax the good days",
        paragraphs: [
          "The obvious fix for a slow day is a discount. But a discount does not know a Tuesday from a Saturday, and regulars who would have come anyway pay less for the same plate.",
          "A quieter tool is a bonus that only lands on the day you choose. A double stamp day pays an extra stamp on the quiet weekday only, every week, so the Saturday crowd never feels it and the Tuesday starts to feel like the clever day to visit.",
        ],
      },
      {
        heading: "Two weeks is a habit",
        paragraphs: [
          "Habits take repetition. Pair the double day with a streak: guests who visit twice a week for a few weeks earn a bonus run of stamps. A missed week pauses the run rather than wiping it, so one bad week does not destroy a regular's progress.",
          "Patron runs both tools from one cap: a monthly bonus stamp budget the owner sets. When it is used up, the bonus stamps pause until the first of the month, so the give-away stays affordable whatever happens.",
        ],
      },
      {
        heading: "How to choose the day",
        paragraphs: [
          "Use your quietest hour, not your worst day. A double stamp day across a slow lunch window usually beats rewarding an entire dead weekday. Then keep the wording simple at the till: stamp twice today, one more visit sooner.",
          "Bonus days work best when they are limited and predictable. Say the same thing every week, and let the extra stamp do the persuading.",
        ],
      },
    ],
  },
  {
    slug: "three-messages-worth-the-airtime",
    title: "Three messages worth the airtime",
    date: "2026-10-14",
    readMinutes: 4,
    excerpt:
      "Most loyalty SMS goes out too often and reads like a flyer. Three message types earn their keep, and one habit keeps guests in charge.",
    sections: [
      {
        heading: "Say something they asked to hear",
        paragraphs: [
          "The guests on your list opted in once, usually at the counter. They did not sign up for weekly specials. The messages that keep opt-ins are the ones about their card: your reward is ready, you are one stamp away, or a simple thank you for a good month.",
          "The reward earned message is the strongest of the three. A guest who has earned their reward and is told about it comes back to collect, and the collection visit is where the next card starts.",
        ],
      },
      {
        heading: "The miss you message, done right",
        paragraphs: [
          "A guest who has not visited in a while is worth one quiet nudge, not a series. Patron's miss you offer waits a fortnight or more after the last visit, shows once, and moves on. Held back offers with a cooldown keep a small venue's SMS bill calm.",
          "Every message still carries a STOP line, the weekly cap and the monthly budget apply, and a guest who replies STOP is out of every send until they say otherwise.",
        ],
      },
      {
        heading: "A number you can check",
        paragraphs: [
          "Judge messages by visits, not clicks. After a campaign, compare the week with the weeks before it. If a campaign cannot beat a quiet thank you at bringing people back, run the thank you instead.",
        ],
      },
    ],
  },
];

export function findBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "long" }).format(new Date(`${iso}T00:00:00Z`));
}
