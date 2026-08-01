// OTTO's agent card — the fleet presence contract. See _runtime.js.
import { statusCard } from './_runtime.js';

export default async function handler(req, res) {
  return statusCard({
    req, res,
    agentName: 'OTTO',
    capabilities: ['tools', 'threads'],
  });
}
