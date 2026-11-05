import { plural as sharedPlural } from "./plural";

export function countLabel(count: number, singular: string, pluralForm = `${singular}s`): string {
  return sharedPlural(count, singular, pluralForm);
}
