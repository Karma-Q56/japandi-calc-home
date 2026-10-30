import { clock } from "@/lib/clock";
import { demoRepo, updateDemo } from "@/data/repo";
import type { OnboardingStep } from "@/data/types";
import { failure, success } from "./demo";

export const ONBOARDING_STEPS: Array<{
  id: OnboardingStep;
  label: string;
}> = [
  { id: "logo", label: "Collect logo" },
  { id: "hours", label: "Confirm hours" },
  { id: "menu", label: "Capture menu" },
  { id: "reward_rule", label: "Set reward rule" },
  { id: "page", label: "Create public page" },
  { id: "qr_pack", label: "Print QR pack" },
  { id: "staff_training", label: "Train staff" },
  { id: "go_live", label: "Go live" },
  { id: "day_7_checkin", label: "Day-7 check-in" },
];

export function getChecklist(restaurantId: string) {
  const state = demoRepo.read();
  return success(
    state.onboarding.find((item) => item.restaurantId === restaurantId) ?? {
      restaurantId,
      done: {},
    },
  );
}

export function toggleStep(restaurantId: string, step: OnboardingStep) {
  const now = new Date(clock.now()).toISOString();
  updateDemo((current) => {
    const existing = current.onboarding.find((item) => item.restaurantId === restaurantId);
    if (!existing) {
      return {
        ...current,
        onboarding: [...current.onboarding, { restaurantId, done: { [step]: now } }],
      };
    }
    const done = { ...existing.done };
    if (done[step]) delete done[step];
    else done[step] = now;
    return {
      ...current,
      onboarding: current.onboarding.map((item) =>
        item.restaurantId === restaurantId ? { ...item, done } : item,
      ),
    };
  });
  return success(true);
}

export function requireOperator(role: string) {
  if (role !== "operator") return failure("FORBIDDEN", "Operators only.");
  return success(true);
}
