import { isBackendConnected } from '../services/api.js';

// Where a signed-in person goes:
//   organization accounts        -> the organization dashboard (/organization)
//   employees who lead a team    -> the Team Leader dashboard (/team-leader)
//   individual accounts          -> the individual creator's dashboard (/dashboard)
//   an organization's clients    -> the client portal (/client)
//   other employees              -> the employee dashboard (/employee); the studio (/app) without a backend
//   everyone else                -> the studio (/app)
export const homeFor = (user) => {
  if (user?.accountType === 'organization') return '/organization';
  if (user?.accountType === 'employee' && user.teamLeader) return '/team-leader';
  if (user?.accountType === 'individual') return '/dashboard';
  if (user?.accountType === 'client') return '/client';
  if (user?.accountType === 'employee' && isBackendConnected) return '/employee'; // (it needs the backend)
  return '/app';
};