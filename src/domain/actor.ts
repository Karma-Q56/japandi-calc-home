import { demoRepo } from "@/data/repo";

/**
 * The person who pressed publish, in the words an owner would use. The demo
 * session knows the role; a manager also has a staff name.
 */
export function publishedBy(): string {
  const state = demoRepo.read();
  if (state.session.role === "owner") return "Owner";
  if (state.session.role === "manager") {
    return (
      state.staff.find((item) => item.id === state.session.staffId)?.displayName ?? "Manager"
    );
  }
  return "Patron team";
}
