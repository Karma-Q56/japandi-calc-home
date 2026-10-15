// Planner calculations for the marketing site
// These are the reference calculations from SPEC.md section 14

/**
 * Calculate repeat visit metrics based on the planner inputs
 * Reference: R160/250/3%/35%/R1,200 -> 7.5, 32.5, R5,200, R1,820, R620, break-even ~4.9
 * 
 * Inputs:
 * - spend: average spend per visit (R160)
 * - visits: visits per week (250)
 * - lift: percentage lift in return visits (3%)
 * - margin: profit margin percentage (35%)
 * - fee: monthly plan fee (R1,200)
 */
export interface PlannerInput {
  spend: number;
  visits: number;
  lift: number; // percentage
  margin: number; // percentage
  fee: number; // monthly fee in ZAR
}

export interface PlannerResult {
  extraPerWeek: number; // Additional visits per week
  extraPerMonth: number; // Additional visits per month
  sales: number; // Additional sales in ZAR
  contribution: number; // Additional contribution (sales * margin) in ZAR
  afterFee: number; // Contribution after subtracting the plan fee
  breakEvenPerWeek: number | null; // Visits per week needed to break even
}

// Weeks per month constant (from SPEC)
const WEEKS_PER_MONTH = 4.333;

/**
 * Calculate planner metrics
 */
export function calculatePlanner(input: PlannerInput): PlannerResult {
  const { spend, visits, lift, margin, fee } = input;

  // Extra visits per week
  const extraPerWeek = visits * (lift / 100);
  
  // Extra visits per month
  const extraPerMonth = extraPerWeek * WEEKS_PER_MONTH;
  
  // Additional sales (extra visits * average spend)
  const sales = extraPerMonth * spend;
  
  // Additional contribution (sales * margin percentage)
  const contribution = sales * (margin / 100);
  
  // After fee
  const afterFee = contribution - fee;
  
  // Break-even calculation
  // Per visit contribution = spend * (margin / 100)
  const perVisitContribution = spend * (margin / 100);
  
  // Break-even visits per week: fee / (perVisitContribution * weeksPerMonth)
  const breakEvenPerWeek = perVisitContribution > 0 
    ? fee / (perVisitContribution * WEEKS_PER_MONTH)
    : null;

  return {
    extraPerWeek,
    extraPerMonth,
    sales,
    contribution,
    afterFee,
    breakEvenPerWeek,
  };
}

/**
 * Reference calculation from SPEC
 * R160/250/3%/35%/R1,200 should give:
 * - extraPerWeek: 7.5
 * - extraPerMonth: 32.5
 * - sales: R5,200
 * - contribution: R1,820
 * - afterFee: R620
 * - breakEvenPerWeek: ~4.9
 */
export function getReferencePlanner(): PlannerInput {
  return {
    spend: 160,
    visits: 250,
    lift: 3,
    margin: 35,
    fee: 1200,
  };
}

/**
 * Run the reference calculation and verify it matches the expected values
 */
export function verifyReferencePlanner(): boolean {
  const input = getReferencePlanner();
  const result = calculatePlanner(input);

  // Check against expected values (with some tolerance for floating point)
  const checks = [
    Math.abs(result.extraPerWeek - 7.5) < 0.01,
    Math.abs(result.extraPerMonth - 32.5) < 0.01,
    Math.abs(result.sales - 5200) < 0.01,
    Math.abs(result.contribution - 1820) < 0.01,
    Math.abs(result.afterFee - 620) < 0.01,
    result.breakEvenPerWeek !== null && Math.abs(result.breakEvenPerWeek - 4.9) < 0.1,
  ];

  return checks.every(c => c);
}

/**
 * Format a ZAR amount for display
 * R1,299 format with comma thousands separator
 */
export function formatZAR(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const text = `R${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  return amount < 0 && rounded > 0 ? `\u2212${text}` : text;
}
