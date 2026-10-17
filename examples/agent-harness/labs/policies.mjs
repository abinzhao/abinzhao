import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

const effects = new Set(['read', 'write', 'network', 'delete', 'execute']);

function bind(action) {
  if (action && Object.keys(action).some((field) => !['tool', 'cwd', 'argv', 'effects'].includes(field))) {
    throw new Error('Unknown action field; extend the binding contract before use');
  }
  if (!action || typeof action.tool !== 'string' || !action.tool ||
      typeof action.cwd !== 'string' || !isAbsolute(action.cwd) ||
      !Array.isArray(action.argv) || !action.argv.every((value) => typeof value === 'string') ||
      !Array.isArray(action.effects) || !action.effects.length ||
      !action.effects.every((effect) => effects.has(effect))) {
    throw new Error('Invalid action or effect declaration');
  }
  return JSON.stringify({
    tool: action.tool, cwd: action.cwd, argv: action.argv,
    effects: [...new Set(action.effects)].sort(),
  });
}

export function createApprovalGate({ now = Date.now, ttlMs = 30_000, denyEffects = [] } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !denyEffects.every((effect) => effects.has(effect))) {
    throw new Error('Invalid approval policy');
  }
  const denied = new Set(denyEffects);
  const tickets = new Map();
  return {
    approve(action) {
      const binding = bind(action);
      if (action.effects.some((effect) => denied.has(effect))) {
        throw new Error('Action denied by hard policy');
      }
      const ticket = randomUUID();
      tickets.set(ticket, { binding, expires: now() + ttlMs });
      return ticket;
    },
    consume(ticket, action) {
      const approved = tickets.get(ticket);
      if (!approved) throw new Error('Approval unknown or already consumed');
      if (now() >= approved.expires) {
        tickets.delete(ticket);
        throw new Error('Approval expired');
      }
      if (approved.binding !== bind(action)) throw new Error('Approval binding mismatch');
      tickets.delete(ticket);
    },
  };
}
