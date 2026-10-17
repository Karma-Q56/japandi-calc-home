import type { DemoState, Restaurant, Theme } from "./types";

const themes: Theme[] = [
  {
    ink: "#263a2d",
    paper: "#f5f0e5",
    accent: "#b6633f",
    accentSoft: "#ead4c4",
    stampFilled: "#b6633f",
    stampEmpty: "#d8d0c1",
    headingFont: "Bricolage Grotesque",
    bodyFont: "DM Sans",
    radius: 18,
    stampShape: "coffee-cup",
    cardBackground: "paper",
    tagline: "A little perk for your daily ritual",
  },
  {
    ink: "#423523",
    paper: "#f4e8d3",
    accent: "#9a6333",
    accentSoft: "#e8d0ae",
    stampFilled: "#9a6333",
    stampEmpty: "#d7c9b2",
    headingFont: "Bricolage Grotesque",
    bodyFont: "DM Sans",
    radius: 12,
    stampShape: "croissant",
    cardBackground: "flat",
    tagline: "Fresh from the oven, made for you",
  },
  {
    ink: "#29334a",
    paper: "#f1f0e9",
    accent: "#687c61",
    accentSoft: "#dce4d7",
    stampFilled: "#687c61",
    stampEmpty: "#cbd0c4",
    headingFont: "Bricolage Grotesque",
    bodyFont: "DM Sans",
    radius: 22,
    stampShape: "circle",
    cardBackground: "gradient",
    tagline: "Good food, familiar faces",
  },
];
const hours = {
  Monday: { open: "07:00", close: "16:00" },
  Tuesday: { open: "07:00", close: "16:00" },
  Wednesday: { open: "07:00", close: "16:00" },
  Thursday: { open: "07:00", close: "16:00" },
  Friday: { open: "07:00", close: "17:00" },
  Saturday: { open: "08:00", close: "15:00" },
  Sunday: null,
};
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function safeCode(index: number) {
  let value = index;
  let output = "";
  for (let i = 0; i < 6; i++) {
    output = codeAlphabet[value % codeAlphabet.length]! + output;
    value = Math.floor(value / codeAlphabet.length);
  }
  return `PT${output}`;
}
const baseRestaurants: Restaurant[] = [
  {
    id: "rest-daily-grind",
    slug: "daily-grind",
    name: "The Daily Grind",
    status: "active",
    plan: "custom",
    suburb: "Parkhurst",
    address: "4th Avenue, Parkhurst",
    hours,
    stampsRequired: 8,
    rewardDescription: "a free coffee",
    visitWindowMinutes: 240,
    welcomeStamp: true,
    theme: themes[0]!,
    pageConfig: ["hero", "about", "hours", "menu", "special", "join"].map((type) => ({
      type,
      enabled: true,
    })),
    menuSectionIds: ["sec-coffee", "sec-bakes"],
    specialIds: ["special-daily"],
    createdAt: "2026-01-05T08:00:00.000Z",
    creditCents: 4200,
    senderName: "DailyGrind",
    smsCapRestaurant: 3,
    smsCapMember: 2,
    contact: "hello@dailygrind.co.za",
  },
  {
    id: "rest-sunrise-bakes",
    slug: "sunrise-bakes",
    name: "Sunrise Bakes",
    status: "active",
    plan: "managed",
    suburb: "Melville",
    address: "7th Street, Melville",
    hours,
    stampsRequired: 6,
    rewardDescription: "A pastry of your choice",
    visitWindowMinutes: 240,
    welcomeStamp: true,
    theme: themes[1]!,
    pageConfig: ["hero", "about", "hours", "menu", "special", "join"].map((type) => ({
      type,
      enabled: true,
    })),
    menuSectionIds: ["sec-pastry"],
    specialIds: ["special-sunrise"],
    createdAt: "2026-01-06T08:00:00.000Z",
    creditCents: 2700,
    senderName: "SunriseBake",
    smsCapRestaurant: 3,
    smsCapMember: 2,
    contact: "hello@sunrisebakes.co.za",
  },
  {
    id: "rest-oak-table",
    slug: "oak-table",
    name: "The Oak Table",
    status: "active",
    plan: "partner",
    suburb: "Rosebank",
    address: "Oxford Road, Rosebank",
    hours,
    stampsRequired: 10,
    rewardDescription: "a free main",
    visitWindowMinutes: 240,
    welcomeStamp: true,
    theme: themes[2]!,
    pageConfig: ["hero", "about", "hours", "menu", "special", "join"].map((type) => ({
      type,
      enabled: true,
    })),
    menuSectionIds: ["sec-lunch"],
    specialIds: ["special-oak"],
    createdAt: "2026-01-07T08:00:00.000Z",
    creditCents: 6100,
    senderName: "OakTable",
    smsCapRestaurant: 3,
    smsCapMember: 2,
    contact: "hello@oaktable.co.za",
  },
];

export function createSeed(now = Date.UTC(2026, 9, 1, 8)): DemoState {
  const restaurants = structuredClone(baseRestaurants);
  const customers = Array.from({ length: 60 }, (_, i) => ({
    id: `customer-${i + 1}`,
    name:
      ["Thandi Mokoena", "James Ndlovu", "Sipho Nkosi", "Lerato Dlamini", "Ayesha Khan"][i % 5] +
      ` ${i + 1}`,
    phoneE164: `+278255501${String(i + 1).padStart(2, "0")}`,
    memberCode: safeCode(i + 1),
    qrToken: `demo-token-${String(i + 1).padStart(4, "0")}`,
    ...(i % 6 === 0 ? { birthday: "1994-06-12" } : {}),
  }));
  const memberships = customers.map((customer, i) => {
    const restaurantIndex = Math.floor(i / 20);
    const restaurant = restaurants[restaurantIndex]!;
    const daysAgo = i % 11 === 0 ? 42 + (i % 10) : i % 30;
    const lastVisitAt = new Date(now - daysAgo * 86400000).toISOString();
    const stampsCurrent = i % restaurant.stampsRequired;
    return {
      id: `membership-${restaurantIndex + 1}-${i + 1}`,
      restaurantId: restaurant.id,
      customerId: customer.id,
      joinedAt: new Date(now - (95 - (i % 90)) * 86400000).toISOString(),
      source: i % 3 === 0 ? "qr" : `table-${(i % 8) + 1}`,
      stampsCurrent,
      stampsTotal: stampsCurrent + (i % 20) * 2,
      lastVisitAt,
      welcomeStamp: true,
      marketingSms: i % 4 !== 0,
      marketingPush: false,
      lastSeenStamps: Math.max(0, stampsCurrent - (i % 3)),
    };
  });
  memberships.push({
    ...memberships[0]!,
    id: "membership-daily-grind-thandi",
    restaurantId: restaurants[1]!.id,
    customerId: customers[0]!.id,
    joinedAt: new Date(now - 25 * 86400000).toISOString(),
    source: "qr",
    stampsCurrent: 2,
    stampsTotal: 6,
    lastVisitAt: new Date(now - 2 * 86400000).toISOString(),
    lastSeenStamps: 1,
  });
  const stamps = Array.from({ length: 180 }, (_, i) => {
    const membership = memberships[i % memberships.length]!;
    return {
      id: `stamp-${i + 1}`,
      restaurantId: membership.restaurantId,
      membershipId: membership.id,
      staffId: null,
      key: null,
      createdAt: new Date(now - ((i * 13) % 90) * 86400000).toISOString(),
      status: "valid" as const,
    };
  });
  const sections = [
    { id: "sec-coffee", restaurantId: restaurants[0]!.id, name: "Coffee & tea", sortOrder: 0 },
    { id: "sec-bakes", restaurantId: restaurants[0]!.id, name: "From the oven", sortOrder: 1 },
    { id: "sec-pastry", restaurantId: restaurants[1]!.id, name: "Fresh bakes", sortOrder: 0 },
    { id: "sec-lunch", restaurantId: restaurants[2]!.id, name: "Lunch favourites", sortOrder: 0 },
  ];
  const items = [
    ["sec-coffee", "Flat white", "Double espresso, silky milk", 380],
    ["sec-coffee", "Long black", "A smooth double espresso", 300],
    ["sec-bakes", "Butter croissant", "Baked fresh each morning", 420],
    ["sec-pastry", "Almond croissant", "Filled with almond cream", 480],
    ["sec-pastry", "Sourdough loaf", "Slow-fermented overnight", 650],
    ["sec-lunch", "Roast chicken bowl", "Seasonal greens and grains", 1250],
  ].map(([sectionId, name, description, price], i) => ({
    id: `item-${i + 1}`,
    restaurantId: sections.find((s) => s.id === sectionId)!.restaurantId,
    sectionId: String(sectionId),
    name: String(name),
    description: String(description),
    priceCents: Number(price) * 100,
    available: true,
    sortOrder: i,
  }));
  const specials = restaurants.map((r, i) => ({
    id: `special-${["daily", "sunrise", "oak"][i]}`,
    restaurantId: r.id,
    title: ["Tuesday coffee and breakfast", "Morning bun special", "Neighbourhood lunch"][i]!,
    body: [
      "A coffee on us with any breakfast before 10am.",
      "Add a filter coffee to any pastry for R25.",
      "Bring a friend and enjoy a shared dessert.",
    ][i]!,
    startsAt: new Date(now - 86400000).toISOString(),
    endsAt: new Date(now + 14 * 86400000).toISOString(),
    active: true,
  }));
  const rewards = memberships
    .filter((_, i) => i % 9 === 0)
    .map((m, i) => ({
      id: `reward-${i + 1}`,
      restaurantId: m.restaurantId,
      membershipId: m.id,
      description: restaurants.find((r) => r.id === m.restaurantId)!.rewardDescription,
      earnedAt: m.lastVisitAt ?? new Date(now).toISOString(),
      ...(i % 3 === 0 ? { redeemedAt: new Date(now - 86400000).toISOString() } : {}),
    }));
  const messages = customers.slice(0, 5).map((customer, i) => ({
    id: `message-seed-${i + 1}`,
    restaurantId: restaurants[0]!.id,
    customerId: customer.id,
    body: `Hi ${customer.name.split(" ")[0]}, we miss you! Visit this Tuesday for a coffee on us. Reply STOP to opt out.`,
    segments: 2,
    costCents: 70,
    status: (i === 0 ? "queued" : i === 4 ? "failed" : "delivered") as
      "queued" | "failed" | "delivered",
    createdAt: new Date(now - (i + 1) * 3600000).toISOString(),
  }));
  return {
    version: 2,
    now,
    session: { role: "operator" },
    restaurants,
    staff: restaurants.map((r, i) => ({
      id: `staff-${i + 1}`,
      restaurantId: r.id,
      displayName: ["Mia", "Thabo", "Zanele"][i]!,
      active: true,
      // Demo PINs: 1234 / 2345 / 3456 (HMAC-SHA256, see src/lib/pin.ts).
      pinHash: [
        "d3c06b557b557cceab0d8d1bf86080c2fe52c54fcad30d2c71ecd1185f48c470",
        "71cdffabd248fa0499e5b5667b2fe772971cc1bd49ef9a2162410c21822f0825",
        "25989fffa1a1c1a3d4c752b50602f11972883c5ff51048a7a64cc77a4790a1c9",
      ][i]!,
    })),
    sections,
    items,
    specials,
    customers,
    memberships,
    consents: [],
    stamps,
    rewards,
    campaigns: restaurants.map((r, i) => ({
      id: `campaign-${i + 1}`,
      restaurantId: r.id,
      name: "A little Tuesday treat",
      body: "We miss you! Pop by for a neighbourhood special.",
      code: "TUESDAY",
      sentAt: new Date(now - 7 * 86400000).toISOString(),
      recipients: 12 + i,
      delivered: 11 + i,
      failed: 1,
      awardStamp: true,
    })),
    messages,
    redemptions: [],
    ledger: restaurants.map((r, i) => ({
      id: `ledger-${i + 1}`,
      restaurantId: r.id,
      type: "topup",
      amountCents: [4200, 2700, 6100][i]!,
      reference: `demo-topup-${i + 1}`,
      createdAt: new Date(now - 30 * 86400000).toISOString(),
    })),
    payments: [],
    pushSubscriptions: [],
    audit: [],
    leads: [],
    dataRequests: [],
    rateLimitHits: [],
    pairingCodes: [],
    otpSendLog: [],
    pinAttempts: [],
    pinLockouts: [],
    onboarding: restaurants.map((r) => ({ restaurantId: r.id, done: {} })),
  };
}
