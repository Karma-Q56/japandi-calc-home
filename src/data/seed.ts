import type { DemoState, Order, Referral, Restaurant, Special, Theme } from "./types";
import { johannesburgMonthDay } from "@/lib/birthday";

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
    venueType: "cafe",
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
    welcomeStamps: 2,
    theme: themes[0]!,
    pageTemplate: "hero",
    pageConfig: ["hero", "about", "hours", "menu", "special", "join"].map((type) => ({
      type,
      enabled: true,
    })),
    menuSectionIds: ["sec-coffee", "sec-bakes"],
    specialIds: ["special-daily", "special-daily-members"],
    createdAt: "2026-01-05T08:00:00.000Z",
    creditCents: 4200,
    senderName: "DailyGrind",
    smsCapRestaurant: 3,
    smsCapMember: 2,
    contact: "hello@dailygrind.co.za",
    tiers: { regular: 3, vip: 8 },
    mysteryEveryVisits: 7,
    birthdayReward: true,
    birthdayRewardKind: "stamp",
    birthdayRewardItem: "",
    spin: {
      enabled: true,
      modes: ["join", "earned", "reward_decider"],
      segments: [
        { id: "spin-1", label: "Free filter coffee", weight: 30, valueCents: 300 },
        { id: "spin-2", label: "R20 off your next visit", weight: 25, valueCents: 2000, cap: { period: "week", max: 10 } },
        { id: "spin-3", label: "Slice of banana bread", weight: 20, valueCents: 450 },
        { id: "spin-4", label: "Two bonus stamps", weight: 15, valueCents: 0, bonusStamps: 2 },
        { id: "spin-5", label: "Try again tomorrow", weight: 10, valueCents: 0 },
      ],
      weeklyBudgetCents: 15000,
      earnEveryVisits: 5,
      earnAtMilestone: true,
      rewardFloorCents: 300,
      rules:
        "One welcome spin when you join, and one earned spin every five visits or reward milestone. When a card completes, the venue draws your reward from its prize list at random, never below the advertised reward. No purchase is required to earn spins. Prizes are personal, single-use offers valid for 30 days and cannot be exchanged for cash.",
    },
  },
  {
    id: "rest-sunrise-bakes",
    slug: "sunrise-bakes",
    venueType: "bakery",
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
    welcomeStamps: 1,
    theme: themes[1]!,
    pageTemplate: "menu-first",
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
    tiers: { regular: 2, vip: 6 },
    mysteryEveryVisits: 0,
    birthdayReward: true,
    birthdayRewardKind: "freeItem",
    birthdayRewardItem: "birthday cupcake",
    spin: {
      enabled: false,
      segments: [],
      weeklyBudgetCents: 0,
      earnEveryVisits: 5,
      earnAtMilestone: false,
      rules: "",
    },
  },
  {
    id: "rest-oak-table",
    slug: "oak-table",
    venueType: "restaurant",
    name: "The Oak Table",
    status: "active",
    plan: "partner",
    suburb: "Rosebank",
    address: "Oxford Road, Rosebank",
    hours,
    stampsRequired: 10,
    rewardDescription: "a free main",
    visitWindowMinutes: 240,
    welcomeStamp: false,
    welcomeStamps: 0,
    theme: themes[2]!,
    pageTemplate: "minimal",
    pageConfig: ["hero", "about", "hours", "menu", "special", "join"].map((type) => ({
      type,
      enabled: true,
    })),
    menuSectionIds: ["sec-lunch"],
    specialIds: ["special-oak", "special-oak-vip"],
    createdAt: "2026-01-07T08:00:00.000Z",
    creditCents: 6100,
    senderName: "OakTable",
    smsCapRestaurant: 3,
    smsCapMember: 2,
    contact: "hello@oaktable.co.za",
    tiers: { regular: 4, vip: 10 },
    mysteryEveryVisits: 0,
    birthdayReward: false,
    spin: {
      enabled: false,
      segments: [],
      weeklyBudgetCents: 0,
      earnEveryVisits: 5,
      earnAtMilestone: false,
      rules: "",
    },
  },
];

const GUEST_FIRST_NAMES = ["Thandi", "James", "Sipho", "Lerato", "Ayesha", "Ben", "Naledi", "Pieter", "Zanele", "Kabelo", "Megan", "Themba"];
const GUEST_SURNAME_INITIALS = ["M", "N", "K", "D", "V"];

/** 12 first names x 5 surname initials = 60 unique demo guests, e.g. "Sipho N.". */
function guestNameAt(i: number): string {
  const first = GUEST_FIRST_NAMES[i % GUEST_FIRST_NAMES.length]!;
  const initial = GUEST_SURNAME_INITIALS[Math.floor(i / GUEST_FIRST_NAMES.length) % GUEST_SURNAME_INITIALS.length]!;
  return `${first} ${initial}.`;
}

export function createSeed(now = Date.UTC(2026, 9, 1, 8)): DemoState {
  const restaurants = structuredClone(baseRestaurants);
  // The demo venues show both till order modes: the coffee shop tracks items,
  // the bakery counts simple categories, and the bistro keeps it off.
  restaurants[0]!.trackOrders = true;
  restaurants[0]!.ordersMode = "items";
  restaurants[1]!.trackOrders = true;
  restaurants[1]!.ordersMode = "categories";
  // Bring a friend is on at the coffee shop so the owner dashboard has a story.
  restaurants[0]!.referral = {
    enabled: true,
    rewardKind: "stamp",
    rewardItem: "",
    limitPerMemberPerMonth: 2,
  };
  // Fictional address. Nothing is emailed in demo; the operator inbox shows it as a placeholder.
  restaurants[0]!.enquiryNotifyEmail = "hello@thedailygrind.example";
  const todayParts = johannesburgMonthDay(now);
  const customers = Array.from({ length: 60 }, (_, i) => ({
    id: `customer-${i + 1}`,
    name: guestNameAt(i),
    phoneE164: `+278255501${String(i + 1).padStart(2, "0")}`,
    memberCode: safeCode(i + 1),
    qrToken: `demo-token-${String(i + 1).padStart(4, "0")}`,
    // Day and month only; every sixth guest shares a day so the pattern holds.
    ...(i % 6 !== 5
      ? {
          birthday: {
            day: ((i * 7) % 27) + 1,
            month: i % 6 === 0 ? todayParts.month : ((i * 5 + todayParts.month) % 12) + 1,
          },
        }
      : {}),
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
  // Realistic visit rhythm: each guest keeps a usual time of day, so the
  // morning regulars, lunch crowd and evening visitors read clearly.
  const VISIT_HOURS_UTC = [6, 10, 13, 17];
  const stamps = Array.from({ length: 180 }, (_, i) => {
    const membership = memberships[i % memberships.length]!;
    const hour = VISIT_HOURS_UTC[(i % memberships.length) % VISIT_HOURS_UTC.length]!;
    const visitAt = new Date(now - ((i * 13) % 90) * 86400000);
    visitAt.setUTCHours(hour, i % 60, 0, 0);
    return {
      id: `stamp-${i + 1}`,
      restaurantId: membership.restaurantId,
      membershipId: membership.id,
      staffId: null,
      key: null,
      createdAt: visitAt.toISOString(),
      status: "valid" as const,
      reason: "visit" as const,
    };
  });
  // Demo till orders: the coffee shop's most ordered items feed the quick
  // buttons and the insights page. Linked to real stamps where one fits.
  const dailyOrders: Array<{ labels: [string, number][]; at: number }> = [
    { labels: [["Flat white", 2]], at: now - 1 * 86400000 },
    { labels: [["Flat white", 1], ["Butter croissant", 1]], at: now - 2 * 86400000 },
    { labels: [["Flat white", 1]], at: now - 3 * 86400000 },
    { labels: [["Long black", 1], ["Butter croissant", 2]], at: now - 4 * 86400000 },
    { labels: [["Flat white", 1]], at: now - 5 * 86400000 },
    { labels: [["Butter croissant", 1]], at: now - 6 * 86400000 },
    { labels: [["Flat white", 1], ["Roast chicken bowl", 1]], at: now - 8 * 86400000 },
    { labels: [["Long black", 1]], at: now - 9 * 86400000 },
  ];
  const dailyMembershipIds = memberships
    .filter((m) => m.restaurantId === restaurants[0]!.id)
    .map((m) => m.id);
  let atError = 0;
  const orders: Order[] = dailyOrders.map((dailyOrder, index) => ({
    id: `order-daily-${index + 1}`,
    restaurantId: restaurants[0]!.id,
    membershipId: dailyMembershipIds[index % dailyMembershipIds.length] as string,
    source: "till" as const,
    items: dailyOrder.labels.map(([label, qty]) => ({ label, qty, kind: "item" as const })),
    ...(index % 3 === 0 ? { billCents: 380 + index } : {}),
    createdAt: new Date(dailyOrder.at + 3600000 + (atError += 60000)).toISOString(),
  }));
  const sunriseOrderCategories: Array<{ label: string; qty: number; at: number }> = [
    { label: "Breakfast", qty: 2, at: now - 2 * 86400000 },
    { label: "Coffee", qty: 3, at: now - 3 * 86400000 },
    { label: "Dessert", qty: 1, at: now - 5 * 86400000 },
  ];
  const sunriseMembershipIds = memberships
    .filter((m) => m.restaurantId === restaurants[1]!.id)
    .map((m) => m.id);
  sunriseOrderCategories.forEach((category, index) => {
    orders.push({
      id: `order-sunrise-${index + 1}`,
      restaurantId: restaurants[1]!.id,
      membershipId: sunriseMembershipIds[index % sunriseMembershipIds.length] as string,
      source: "till" as const,
      items: [{ label: category.label, qty: category.qty, kind: "category" }],
      createdAt: new Date(category.at + 7200000).toISOString(),
    });
  });
  // Bring a friend story: one rewarded pair and one waiting for the first
  // stamped visit, so the owner's page shows how the reward works.
  const referrals: Referral[] = [
    {
      id: "referral-seed-rewarded",
      restaurantId: restaurants[0]!.id,
      referrerMembershipId: dailyMembershipIds[1]!,
      friendMembershipId: dailyMembershipIds[4]!,
      referrerCode: "PALTUMEL2",
      createdAt: new Date(now - 14 * 86400000).toISOString(),
      status: "rewarded" as const,
      rewardedAt: new Date(now - 10 * 86400000).toISOString(),
    },
    {
      id: "referral-seed-pending",
      restaurantId: restaurants[0]!.id,
      referrerMembershipId: dailyMembershipIds[2]!,
      friendMembershipId: dailyMembershipIds[5]!,
      referrerCode: "PALSIZWE4",
      createdAt: new Date(now - 3 * 86400000).toISOString(),
      status: "pending" as const,
    },
  ];
  const referrerCodes: Array<[string, string]> = [
    [dailyMembershipIds[1]!, "PALTUMEL2"],
    [dailyMembershipIds[2]!, "PALSIZWE4"],
  ];
  memberships.forEach((membership) => {
    const shareable = membership as { referralCode?: string };
    const match = referrerCodes.find(([id]) => id === membership.id);
    if (match && !shareable.referralCode) shareable.referralCode = match[1]!;
  });
  const sections = [
    { id: "sec-coffee", restaurantId: restaurants[0]!.id, name: "Coffee & tea", sortOrder: 0 },
    { id: "sec-bakes", restaurantId: restaurants[0]!.id, name: "From the oven", sortOrder: 1 },
    { id: "sec-pastry", restaurantId: restaurants[1]!.id, name: "Fresh bakes", sortOrder: 0 },
    { id: "sec-lunch", restaurantId: restaurants[2]!.id, name: "Lunch favourites", sortOrder: 0 },
  ];
  const items = [
    ["sec-coffee", "Flat white", "Double espresso, silky milk", 38],
    ["sec-coffee", "Long black", "A smooth double espresso", 24],
    ["sec-bakes", "Butter croissant", "Baked fresh each morning", 26],
    ["sec-pastry", "Almond croissant", "Filled with almond cream", 32],
    ["sec-pastry", "Sourdough loaf", "Slow-fermented overnight", 45],
    ["sec-lunch", "Roast chicken bowl", "Seasonal greens and grains", 95],
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
  const specials: Special[] = restaurants.map((r, i) => ({
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
    kind: "public" as const,
    code: ["DAILY10", "MORNING", "LUNCH10"][i]!,
    minTier: null,
    createdAt: new Date(now - 3 * 86400000).toISOString(),
  }));
  specials.push(
    {
      id: "special-daily-members",
      restaurantId: restaurants[0]!.id,
      title: "Regulars' Friday flat white",
      body: "Members who visit often get a flat white on us every Friday.",
      startsAt: new Date(now - 86400000).toISOString(),
      endsAt: new Date(now + 21 * 86400000).toISOString(),
      active: true,
      kind: "members" as const,
      code: "REGULARS",
      minTier: "regular" as const,
      createdAt: new Date(now - 2 * 86400000).toISOString(),
    },
    {
      id: "special-oak-vip",
      restaurantId: restaurants[2]!.id,
      title: "VIP tasting plate",
      body: "Our regulars get a small tasting plate with any main.",
      startsAt: new Date(now - 86400000).toISOString(),
      endsAt: new Date(now + 21 * 86400000).toISOString(),
      active: true,
      kind: "members" as const,
      code: "OAKVIP",
      minTier: "vip" as const,
      createdAt: new Date(now - 2 * 86400000).toISOString(),
    },
    {
      id: "special-oak-targeted",
      restaurantId: restaurants[2]!.id,
      title: "A thank you, just for you",
      body: "One shared dessert on us. This code is yours alone.",
      startsAt: new Date(now - 86400000).toISOString(),
      endsAt: new Date(now + 30 * 86400000).toISOString(),
      active: true,
      kind: "targeted" as const,
      minTier: null,
      createdAt: new Date(now - 86400000).toISOString(),
    },
  );
  // Targeted specials get one unique, single-use code per chosen member.
  const oakMembers = memberships.filter((m) => m.restaurantId === restaurants[2]!.id).slice(0, 6);
  const specialCodes = oakMembers.map((m, i) => ({
    id: `special-code-${i + 1}`,
    restaurantId: restaurants[2]!.id,
    specialId: "special-oak-targeted",
    membershipId: m.id,
    code: `OAKTHANKS${i + 1}`,
    issuedAt: new Date(now - 86400000).toISOString(),
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
  const sentAt = new Date(now - 7 * 86400000).toISOString();
  const messages = customers.slice(0, 12).map((customer, i) => ({
    id: `message-seed-${i + 1}`,
    restaurantId: restaurants[0]!.id,
    customerId: customer.id,
    membershipId: `membership-1-${i + 1}`,
    campaignId: "campaign-1",
    channel: "sms" as const,
    body: `Hi ${customer.name.split(" ")[0]}, we miss you! Visit this Tuesday for a coffee on us. Reply STOP to opt out.`,
    segments: 2,
    costCents: 70,
    status: (i === 11 ? "failed" : "delivered") as "failed" | "delivered",
    attempts: 1,
    ...(i === 11 ? { errorCode: "send_failed" } : {}),
    createdAt: new Date(Date.parse(sentAt) - (12 - i) * 60000).toISOString(),
    sentAt,
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
    campaigns: [
      ...restaurants.map((r, i) => ({
        id: `campaign-${i + 1}`,
        restaurantId: r.id,
        name: "A little Tuesday treat",
        body: "We miss you! Pop by for a neighbourhood special.",
        channel: "sms" as const,
        audience: { type: "everyone" } as { type: "everyone" },
        code: ["TUESDAY", "BUNDAY", "LUNCHCLUB"][i]!,
        status: "sent" as const,
        requiresApproval: false,
        sentAt: new Date(now - 7 * 86400000).toISOString(),
        recipients: 12 + i,
        delivered: 11 + i,
        failed: 1,
        awardStamp: true,
        createdBy: "owner-seed",
        createdAt: new Date(now - 8 * 86400000).toISOString(),
        estRecipients: 12 + i,
        estSegments: 2,
        estCostCents: (12 + i) * 70,
        actualCostCents: (11 + i) * 70,
      })),
      {
        id: "campaign-draft-weekend",
        restaurantId: restaurants[0]!.id,
        name: "Weekend family lunch",
        body: "Bring the family this Saturday for a shared dessert.",
        channel: "sms" as const,
        audience: { type: "everyone" } as { type: "everyone" },
        code: "WEEKEND",
        status: "draft" as const,
        requiresApproval: false,
        sentAt: null,
        recipients: 0,
        delivered: 0,
        failed: 0,
        awardStamp: true,
        createdBy: "owner-seed",
        createdAt: new Date(now - 86400000).toISOString(),
        actualCostCents: 0,
      },
    ],
    messages,
    redemptions: [],
    specialCodes,
    spins: [],
    challenges: [
      {
        id: "challenge-daily-3in14",
        restaurantId: restaurants[0]!.id,
        title: "Three visits in 14 days",
        visits: 3,
        windowDays: 14,
        bonusStamps: 1,
        active: true,
        createdAt: new Date(now - 20 * 86400000).toISOString(),
      },
      {
        id: "challenge-sunrise-5in30",
        restaurantId: restaurants[1]!.id,
        title: "Five weekend visits in 30 days",
        visits: 5,
        windowDays: 30,
        bonusStamps: 2,
        active: false,
        createdAt: new Date(now - 20 * 86400000).toISOString(),
      },
    ],
    savedLists: [
      {
        id: "list-daily-regulars",
        restaurantId: restaurants[0]!.id,
        name: "Friday regulars",
        membershipIds: memberships
          .filter((m) => m.restaurantId === restaurants[0]!.id)
          .slice(0, 8)
          .map((m) => m.id),
        createdAt: new Date(now - 12 * 86400000).toISOString(),
        updatedAt: new Date(now - 4 * 86400000).toISOString(),
      },
    ],
    smsReplies: [],
    ledger: restaurants.map((r, i) => ({
      id: `ledger-${i + 1}`,
      restaurantId: r.id,
      type: "topup" as const,
      amountCents: [4200, 2700, 6100][i]!,
      reference: `demo-topup-${i + 1}`,
      createdAt: new Date(now - 30 * 86400000).toISOString(),
    })),
    payments: [],
    pushSubscriptions: [],
    audit: [],
    leads: [
      {
        id: "lead-demo-1",
        reference: "ENQ-2026-001",
        kind: "owner",
        status: "new",
        restaurantName: "The Corner Pantry",
        contactName: "Naledi M.",
        phone: "+27821234001",
        email: "naledi@cornerpantry.example",
        role: "Owner",
        venueType: "Cafe",
        suburb: "Greenside",
        quietTime: "Tuesday morning",
        weeklyGuests: "280",
        planInterest: "Growth",
        visitWanted: true,
        preferredDay: "Wednesday",
        message:
          "We have a paper card now, but we lose track of who comes back. Tuesdays are very quiet.",
        consent: true,
        consentAt: new Date(now - 2 * 86400000).toISOString(),
        createdAt: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        id: "lead-demo-2",
        reference: "ENQ-2026-002",
        kind: "diner",
        status: "new",
        restaurantName: "Baked on 7th",
        contactName: "Diner",
        phone: "",
        suburb: "Melville",
        message: "Please add Baked on 7th. I go there every Saturday and would love a card.",
        consent: true,
        consentAt: new Date(now - 86400000).toISOString(),
        createdAt: new Date(now - 86400000).toISOString(),
      },
      {
        id: "lead-demo-3",
        reference: "ENQ-2026-003",
        kind: "owner",
        status: "replied",
        restaurantName: "The Oak Table",
        contactName: "Pieter v.",
        phone: "+27821234003",
        email: "pieter@oaktable.example",
        role: "Manager",
        venueType: "Restaurant",
        suburb: "Rosebank",
        quietTime: "Monday lunch",
        weeklyGuests: "420",
        planInterest: "Pro",
        visitWanted: true,
        preferredDay: "Monday",
        message: "We would like the done for you campaigns for our quiet lunch trade.",
        consent: true,
        consentAt: new Date(now - 4 * 86400000).toISOString(),
        adminNotes: "Called back. Visit booked for Monday morning.",
        createdAt: new Date(now - 4 * 86400000).toISOString(),
      },
      {
        id: "lead-demo-4",
        reference: "ENQ-2026-004",
        kind: "diner",
        status: "closed",
        restaurantName: "Baked on 7th",
        contactName: "Diner",
        phone: "",
        suburb: "Melville",
        message: "Second ask for Baked on 7th.",
        consent: true,
        consentAt: new Date(now - 7 * 86400000).toISOString(),
        createdAt: new Date(now - 7 * 86400000).toISOString(),
      },
      {
        id: "lead-demo-5",
        reference: "ENQ-2026-005",
        kind: "other",
        status: "closed",
        restaurantName: "A supplier idea",
        contactName: "Thabo K.",
        phone: "+27821234005",
        email: "thabo@example.com",
        message: "I supply compostable takeaway cups to cafes in Johannesburg.",
        consent: true,
        consentAt: new Date(now - 9 * 86400000).toISOString(),
        createdAt: new Date(now - 9 * 86400000).toISOString(),
      },
    ],
    dataRequests: [],
    rateLimitHits: [],
    ideas: [
      {
        id: "idea-seed-1",
        place: "Velo Coffee Roasters",
        suburb: "Parkhurst",
        asks: 4,
        note: "Their flat white is the best in the suburb.",
        status: "new",
        createdAt: new Date(now - 3 * 86400000).toISOString(),
      },
      {
        id: "idea-seed-2",
        place: "Rosetta Bakery",
        suburb: "Parkhurst",
        asks: 2,
        status: "exploring",
        adminNotes: "Called them, waiting on the owner.",
        createdAt: new Date(now - 12 * 86400000).toISOString(),
      },
      {
        id: "idea-seed-3",
        place: "Kota King",
        suburb: "Melville",
        asks: 1,
        note: "Asked for at the till.",
        status: "new",
        createdAt: new Date(now - 1 * 86400000).toISOString(),
      },
    ],
    pairingCodes: [],
    otpSendLog: [],
    providerEvents: [],
    pinAttempts: [],
    pinLockouts: [],
    onboarding: restaurants.map((r) => ({ restaurantId: r.id, done: {} })),
    pageVersions: [],
    orders,
    referrals,
  };
}
