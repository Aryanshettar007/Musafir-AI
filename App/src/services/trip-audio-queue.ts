import { TripItem } from './trip-service';

export interface AudioQueueState {
  queue: string[]; // List of itemIds waiting in line
  played: Record<string, boolean>; // Set of itemIds that have finished or are playing
  playingItem: TripItem | null;
  isPlaying: boolean;
}

type QueueListener = (state: AudioQueueState) => void;

export class TripAudioQueue {
  private queue: string[] = [];
  private played: Record<string, boolean> = {};
  private itemsMap: Map<string, TripItem> = new Map();
  private playingItem: TripItem | null = null;
  private isProcessing = false;
  private audioMultiplier = 2;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<QueueListener>();

  private onPlayItemCallback?: (item: TripItem, multiplier: number) => Promise<void>;
  private onStopItemCallback?: () => void;
  private onListenEventCallback?: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;

  constructor(options?: {
    onPlayItem?: (item: TripItem, multiplier: number) => Promise<void>;
    onStopItem?: () => void;
    onListenEvent?: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;
  }) {
    if (options?.onPlayItem) this.onPlayItemCallback = options.onPlayItem;
    if (options?.onStopItem) this.onStopItemCallback = options.onStopItem;
    if (options?.onListenEvent) this.onListenEventCallback = options.onListenEvent;
  }

  public setCallbacks(callbacks: {
    onPlayItem: (item: TripItem, multiplier: number) => Promise<void>;
    onStopItem: () => void;
    onListenEvent: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;
  }) {
    this.onPlayItemCallback = callbacks.onPlayItem;
    this.onStopItemCallback = callbacks.onStopItem;
    this.onListenEventCallback = callbacks.onListenEvent;
  }

  public setItems(items: TripItem[]) {
    this.itemsMap.clear();
    for (const item of items) {
      this.itemsMap.set(item.id, item);
    }
  }

  public setAudioMultiplier(mult: number) {
    this.audioMultiplier = Math.max(1, mult);
  }

  public getAudioMultiplier(): number {
    return this.audioMultiplier;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AudioQueueState {
    return {
      queue: [...this.queue],
      played: { ...this.played },
      playingItem: this.playingItem,
      isPlaying: this.playingItem !== null,
    };
  }

  private notify() {
    const state = this.getState();
    for (const l of this.listeners) {
      try {
        l(state);
      } catch (err) {
        console.warn('[AudioQueue] Listener error:', err);
      }
    }
  }

  /**
   * Enqueue a story to be played when its geofence triggers.
   * If nothing is playing, starts playing immediately.
   * If something is currently playing, queues behind it so stories never collide or cancel!
   */
  public enqueue(itemId: string, force = false) {
    if (force) {
      delete this.played[itemId];
    }
    // Prevent duplicate queuing of already played or currently playing/queued items
    if (this.played[itemId] || this.queue.includes(itemId) || this.playingItem?.id === itemId) {
      return;
    }

    const item = this.itemsMap.get(itemId);
    if (!item || item.status !== 'ready') {
      return;
    }

    this.queue.push(itemId);
    this.notify();

    // Start playing if idle
    if (!this.isProcessing && !this.playingItem) {
      this.playNext();
    }
  }

  /**
   * Play the next item in the FIFO queue.
   */
  public async playNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    const nextId = this.queue.shift();
    if (!nextId) return;

    const item = this.itemsMap.get(nextId);
    if (!item) {
      this.playNext();
      return;
    }

    this.isProcessing = true;
    this.playingItem = item;
    this.played[item.id] = true;
    this.notify();

    try {
      this.onListenEventCallback?.(item.id, 'started');
      await this.onPlayItemCallback?.(item, this.audioMultiplier);

      // Duration scaled by audio speed multiplier
      const durSec = item.audio?.durationS ?? 30;
      const durationMs = Math.round((durSec * 1000) / this.audioMultiplier) + 400;

      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.finishTimer = setTimeout(() => {
        this.onItemFinished(item.id);
      }, durationMs);
    } catch (err) {
      console.warn('[AudioQueue] Failed to play item:', err);
      this.onItemFinished(item.id);
    }
  }

  private onItemFinished(itemId: string) {
    this.onListenEventCallback?.(itemId, 'completed');
    this.isProcessing = false;
    this.playingItem = null;

    if (this.queue.length > 0) {
      // More items in queue: continue playing the next one!
      this.notify();
      this.playNext();
    } else {
      // Queue is empty: stop Musafir audio completely!
      // This stops ducking so the user's Spotify/Apple Music returns to full volume!
      try {
        this.onStopItemCallback?.();
      } catch {}
      this.notify();
    }
  }

  /**
   * Skip current playing item and advance to next in queue.
   */
  public skip() {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    if (this.playingItem) {
      try {
        this.onListenEventCallback?.(this.playingItem.id, 'skipped');
      } catch {}
    }
    this.isProcessing = false;
    this.playingItem = null;

    if (this.queue.length > 0) {
      this.playNext();
    } else {
      try {
        this.onStopItemCallback?.();
      } catch {}
      this.notify();
    }
  }

  /**
   * Stop audio and clear the remaining queue.
   */
  public stop() {
    const wasPlaying = this.playingItem !== null || this.isProcessing;
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    if (this.playingItem) {
      try {
        this.onListenEventCallback?.(this.playingItem.id, 'skipped');
      } catch {}
    }
    this.queue = [];
    this.playingItem = null;
    this.isProcessing = false;
    if (wasPlaying) {
      try {
        this.onStopItemCallback?.();
      } catch {}
    }
    this.notify();
  }

  /**
   * Reset played status and queue.
   */
  public reset() {
    this.stop();
    this.played = {};
    this.notify();
  }
}
