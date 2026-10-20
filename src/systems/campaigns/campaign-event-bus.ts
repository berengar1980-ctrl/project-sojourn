import type { CampaignEvent } from '../../core/campaign-types';

export interface CampaignEventBus {
  emit(event: CampaignEvent): void;
  subscribe(listener: (event: CampaignEvent) => void): () => void;
}

/** Reentrant emissions are delivered FIFO; a failing subscriber cannot stop the others. */
export function createCampaignEventBus(
  reportError: (error: unknown) => void = (error) => console.error('Campaign event:', error)
): CampaignEventBus {
  const listeners = new Set<(event: CampaignEvent) => void>();
  const queue: CampaignEvent[] = [];
  let dispatching = false;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      queue.push(structuredClone(event));
      if (dispatching) return;
      dispatching = true;
      try {
        let delivered = 0;
        while (queue.length) {
          if (++delivered > 2048) {
            queue.length = 0;
            reportError(new Error('Campaign event delivery limit exceeded.'));
            break;
          }
          const current = queue.shift()!;
          for (const listener of [...listeners]) {
            if (!listeners.has(listener)) continue;
            try {
              listener(structuredClone(current));
            } catch (error) {
              reportError(error);
            }
          }
        }
      } finally {
        dispatching = false;
      }
    },
  };
}
