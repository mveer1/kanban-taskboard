import type { MemberRole } from '@/data/types';
import './RoleBadge.css';

/**
 * Workspace role pill. Shared by the workspace switcher and the members dialog
 * so the colour coding cannot diverge between the two places a role is shown.
 */
export function RoleBadge({ role }: { role: MemberRole }) {
  return <span className={`role-badge ${role}`}>{role}</span>;
}
