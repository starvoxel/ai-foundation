/**
 * pr-watch — stop conditions and cadence (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * The single source of truth for when a watch stops and how long to wait
 * before the next check. Emitted as data (`next_check_after_s`) so the agent
 * or a wrapper simply obeys it. The numbers are untested starting points,
 * tuned here and nowhere else.
 */

const MIN = 60;

/** Cadence and stop numbers, in seconds. */
export const CADENCE = Object.freeze({
  /** Pending CI: re-check interval by time since the pending state began, backing off to a ceiling. */
  pendingSteps: Object.freeze([
    { untilS: 5 * MIN, intervalS: 2 * MIN },
    { untilS: 15 * MIN, intervalS: 5 * MIN },
    { untilS: 30 * MIN, intervalS: 10 * MIN },
  ]),
  pendingCeilingS: 15 * MIN,
  /** Pending longer than this on the same head: report once, then use the long cadence. */
  pendingCapS: 60 * MIN,
  /** Waiting only on a human: re-check interval by time since the last difference, toward the ceiling. */
  humanSteps: Object.freeze([
    { untilS: 30 * MIN, intervalS: 15 * MIN },
    { untilS: 60 * MIN, intervalS: 30 * MIN },
  ]),
  humanCeilingS: 60 * MIN,
  /** Red or conflicting: the agent is expected to act; check back after its push. */
  actionS: 5 * MIN,
  /** No difference for this long: stop and report once. */
  quietStopS: 48 * 60 * MIN,
});

/**
 * @param {readonly {untilS: number, intervalS: number}[]} steps
 * @param {number} ceilingS
 * @param {number} elapsedS
 * @returns {number}
 */
function stepInterval(steps, ceilingS, elapsedS) {
  for (const step of steps) if (elapsedS < step.untilS) return step.intervalS;
  return ceilingS;
}

/**
 * @typedef {object} ScheduleInput
 * @property {string} status - Derived PR status (see digest.js)
 * @property {number} now - Epoch ms
 * @property {number|null} pendingSince - Epoch ms the current pending state began for this head, or null
 * @property {boolean} pendingCapReported - The one-time pending-cap report was already issued for this head
 * @property {number} quietSince - Epoch ms of the last difference from the record
 */

/**
 * Whether the watch must stop, and why. First match wins.
 * @param {{status: string, now: number, quietSince: number, blockerReported: boolean, explicitStop: boolean, landed?: boolean}} input
 * @returns {string|null} `explicit`, `merged`, `closed`, `landed`, `blocker_reported`, `quiet_48h`, or null
 */
export function evaluateStop({ status, now, quietSince, blockerReported, explicitStop, landed }) {
  if (explicitStop) return 'explicit';
  if (status === 'merged') return 'merged';
  if (status === 'closed') return 'closed';
  if (landed) return 'landed';
  if (blockerReported) return 'blocker_reported';
  if ((now - quietSince) / 1000 >= CADENCE.quietStopS) return 'quiet_48h';
  return null;
}

/**
 * Recommend when to check next and which one-time reports are due.
 * @param {ScheduleInput} input
 * @returns {{nextCheckAfterS: number, reportOnce: string[]}}
 */
export function planNext({ status, now, pendingSince, pendingCapReported, quietSince }) {
  const quietS = Math.max(0, (now - quietSince) / 1000);
  if (status === 'pending' || status === 'no_checks') {
    const elapsedS = Math.max(0, (now - (pendingSince ?? now)) / 1000);
    if (elapsedS >= CADENCE.pendingCapS) {
      return {
        nextCheckAfterS: CADENCE.humanCeilingS,
        reportOnce: pendingCapReported ? [] : ['pending_cap'],
      };
    }
    return {
      nextCheckAfterS: stepInterval(CADENCE.pendingSteps, CADENCE.pendingCeilingS, elapsedS),
      reportOnce: [],
    };
  }
  if (status === 'red' || status === 'conflict') {
    return { nextCheckAfterS: CADENCE.actionS, reportOnce: [] };
  }
  return {
    nextCheckAfterS: stepInterval(CADENCE.humanSteps, CADENCE.humanCeilingS, quietS),
    reportOnce: [],
  };
}
