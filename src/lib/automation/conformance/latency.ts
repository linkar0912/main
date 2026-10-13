/**
 * A virtual network for measuring the realtime path in database round trips.
 *
 * Production runs the database a long way from the worker (Germany ->
 * Singapore, ~150-250 ms per round trip), so reply latency is set almost
 * entirely by how many round trips happen one after another before the Meta
 * send. Every repository call here waits on a virtual clock for as many round
 * trips as its Prisma implementation makes; parallel calls overlap exactly as
 * they do in production. Reading the clock when Meta is first asked to send
 * gives the serial round trips a person waits through, independent of the
 * machine running the tests.
 */
import type { AutomationRepository } from "../../repository";

type RepositoryMethod = keyof AutomationRepository & string;

/**
 * Round trips each call costs on the Prisma path (warm statement cache, one
 * round trip per SQL statement - measured from Prisma's query log against
 * Postgres). Prisma sends a lone create/find/raw statement as is, but wraps
 * update/updateMany/deleteMany in BEGIN ... COMMIT, which is three. Anything
 * not listed is one statement.
 */
const ROUND_TRIPS: Partial<Record<RepositoryMethod, number | ((args: unknown[]) => number)>> = {
  // updateManyAndReturn: BEGIN, UPDATE ... RETURNING, COMMIT.
  transitionParticipant: 3,
  completeExecution: 3,
  completeOwnedExecution: 3,
  failAbandonedExecution: 3,
  releaseExecutionClaim: 3,
  releaseOwnedExecutionClaim: 3,
  failOutboundDelivery: 3,
  markOutboundDeliveryUnknown: 3,
  releaseAutomationSendSlots: 1,
  // Reads the contact first unless the caller passes what it already read.
  touchContact: (args) => (args[4] === undefined ? 2 : 1),
};

/** The plan lookup behind the monthly limit: the entitlement row, then its plan. */
export const ENTITLEMENT_ROUND_TRIPS = 2;

export function roundTripsFor(method: string, args: unknown[]): number {
  const cost = ROUND_TRIPS[method as RepositoryMethod];
  if (cost === undefined) return 1;
  return typeof cost === "function" ? cost(args) : cost;
}

export type NetworkCall = { name: string; startedAt: number; roundTrips: number };

async function drainEventLoop(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

export class VirtualNetwork {
  now = 0;
  calls: NetworkCall[] = [];
  private timers: Array<{ at: number; resolve: () => void }> = [];
  /** Outside run() (scenario setup) calls pass straight through, unrecorded. */
  private running = false;

  reset(): void {
    this.now = 0;
    this.calls = [];
    this.timers = [];
  }

  /** Records one call and resolves after its round trips have elapsed on the virtual clock. */
  travel(name: string, roundTrips: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    this.calls.push({ name, startedAt: this.now, roundTrips });
    if (roundTrips <= 0) return Promise.resolve();
    return new Promise((resolve) => this.timers.push({ at: this.now + roundTrips, resolve }));
  }

  /**
   * Runs `work`, advancing the virtual clock only once everything runnable has
   * run, so a call that starts while another is in flight overlaps it.
   */
  async run<T>(work: () => Promise<T>): Promise<T> {
    let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
    this.running = true;
    work().then((value) => { outcome = { ok: true, value }; }, (error: unknown) => { outcome = { ok: false, error }; });
    let idleRounds = 0;
    while (!outcome) {
      await drainEventLoop();
      if (outcome) break;
      if (this.timers.length === 0) {
        idleRounds += 1;
        if (idleRounds > 500) throw new Error("work is waiting on something outside the virtual network");
        await new Promise((resolve) => setTimeout(resolve, 1));
        continue;
      }
      idleRounds = 0;
      const next = Math.min(...this.timers.map((timer) => timer.at));
      this.now = next;
      const due = this.timers.filter((timer) => timer.at === next);
      this.timers = this.timers.filter((timer) => timer.at !== next);
      for (const timer of due) timer.resolve();
    }
    this.running = false;
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  /** Database calls only (Meta calls are recorded with a `meta:` prefix). */
  databaseCalls(): NetworkCall[] {
    return this.calls.filter((call) => !call.name.startsWith("meta:"));
  }
}

export const network = new VirtualNetwork();

/** The repository as the worker sees it, with every call paying its round trips. */
export function withRoundTrips(repository: AutomationRepository): AutomationRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      return async (...args: unknown[]) => {
        await network.travel(property, roundTripsFor(property, args));
        return value.apply(target, args);
      };
    },
  });
}
