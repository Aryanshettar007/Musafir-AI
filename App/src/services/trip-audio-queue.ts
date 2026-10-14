import { TripItem } from './trip-service';

export interface AudioQueueState {
  queue: string[]; // List of itemIds waiting in line
  played: Record<string, boolean>; // Set of itemIds that have finished or are playing
  playingItem: TripItem | null;
  lastPlayedItem: TripItem | null;
  isPlaying: boolean;
  isPaused: boolean;
}

type QueueListener = (state: AudioQueueState) => void;

export class TripAudioQueue {
  private queue: string[] = [];
  private played: Record<string, boolean> = {};
  private itemsMap: Map<string, TripItem> = new Map();
  private playingItem: TripItem | null = null;
  private lastPlayedItem: TripItem | null = null;
  private isProcessing = false;
  private isPaused = false;
  private audioMultiplier = 1;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private startTime = 0;
  private remainingMs = 0;
  private totalDurationMs = 0;
  private listeners = new Set<QueueListener>();

  private onPlayItemCallback?: (item: TripItem, multiplier: number) => Promise<void>;
  private onPauseItemCallback?: () => void;
  private onResumeItemCallback?: () => void;
  private onStopItemCallback?: () => void;
  private onListenEventCallback?: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;

  constructor(options?: {
    onPlayItem?: (item: TripItem, multiplier: number) => Promise<void>;
    onPauseItem?: () => void;
    onResumeItem?: () => void;
    onStopItem?: () => void;
    onListenEvent?: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;
  }) {
    if (options?.onPlayItem) this.onPlayItemCallback = options.onPlayItem;
    if (options?.onPauseItem) this.onPauseItemCallback = options.onPauseItem;
    if (options?.onResumeItem) this.onResumeItemCallback = options.onResumeItem;
    if (options?.onStopItem) this.onStopItemCallback = options.onStopItem;
    if (options?.onListenEvent) this.onListenEventCallback = options.onListenEvent;
  }

  public setCallbacks(callbacks: {
    onPlayItem: (item: TripItem, multiplier: number) => Promise<void>;
    onPauseItem?: () => void;
    onResumeItem?: () => void;
    onStopItem: () => void;
    onListenEvent: (itemId: string, event: 'started' | 'completed' | 'skipped') => void;
  }) {
    this.onPlayItemCallback = callbacks.onPlayItem;
    this.onPauseItemCallback = callbacks.onPauseItem;
    this.onResumeItemCallback = callbacks.onResumeItem;
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
      lastPlayedItem: this.lastPlayedItem,
      isPlaying: this.playingItem !== null && !this.isPaused,
      isPaused: this.isPaused,
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
   * Enqueue a story to be played when its geofence triggers or user taps.
   */
  public enqueue(itemId: string, force = false) {
    if (force) {
      delete this.played[itemId];
      // If forcing playback of a new item while something is playing, stop previous item
      if (this.playingItem && this.playingItem.id !== itemId) {
        if (this.finishTimer) {
          clearTimeout(this.finishTimer);
          this.finishTimer = null;
        }
        this.isProcessing = false;
        this.lastPlayedItem = this.playingItem;
        this.playingItem = null;
        this.isPaused = false;
      }
    }

    if (this.playingItem?.id === itemId) {
      if (this.isPaused) {
        this.resume();
      }
      return;
    }

    // Prevent duplicate queuing of already played or currently queued items
    if (this.played[itemId] || this.queue.includes(itemId)) {
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
   * Pause the currently playing audio.
   */
  public pause() {
    if (!this.playingItem || this.isPaused) return;
    this.isPaused = true;
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    const elapsed = Date.now() - this.startTime;
    this.remainingMs = Math.max(0, this.totalDurationMs - elapsed);
    try {
      this.onPauseItemCallback?.();
    } catch (err) {
      console.warn('[AudioQueue] Pause callback error:', err);
    }
    this.notify();
  }

  /**
   * Resume paused audio.
   */
  public resume() {
    if (!this.playingItem || !this.isPaused) return;
    this.isPaused = false;
    this.startTime = Date.now();
    this.totalDurationMs = this.remainingMs;
    try {
      this.onResumeItemCallback?.();
    } catch (err) {
      console.warn('[AudioQueue] Resume callback error:', err);
    }

    if (this.finishTimer) clearTimeout(this.finishTimer);
    const itemToFinish = this.playingItem;
    this.finishTimer = setTimeout(() => {
      this.onItemFinished(itemToFinish.id);
    }, Math.max(300, this.remainingMs));
    this.notify();
  }

  /**
   * Toggle between playing and paused, or replay target / last item if stopped/idle.
   */
  public togglePlayPause(targetItemId?: string) {
    if (this.isPaused) {
      this.resume();
    } else if (this.playingItem) {
      this.pause();
    } else {
      const idToPlay = targetItemId || this.lastPlayedItem?.id;
      if (idToPlay) {
        this.enqueue(idToPlay, true);
      }
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
    this.isPaused = false;
    this.played[item.id] = true;
    this.notify();

    try {
      this.onListenEventCallback?.(item.id, 'started');
      await this.onPlayItemCallback?.(item, this.audioMultiplier);

      const durSec = item.audio?.durationS ?? 30;
      this.totalDurationMs = Math.round((durSec * 1000) / this.audioMultiplier) + 400;
      this.remainingMs = this.totalDurationMs;
      this.startTime = Date.now();

      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.finishTimer = setTimeout(() => {
        this.onItemFinished(item.id);
      }, this.totalDurationMs);
    } catch (err) {
      console.warn('[AudioQueue] Failed to play item:', err);
      this.onItemFinished(item.id);
    }
  }

  private onItemFinished(itemId: string) {
    this.onListenEventCallback?.(itemId, 'completed');
    this.isProcessing = false;
    this.lastPlayedItem = this.playingItem;
    this.playingItem = null;
    this.isPaused = false;

    if (this.queue.length > 0) {
      this.notify();
      this.playNext();
    } else {
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
      this.lastPlayedItem = this.playingItem;
    }
    this.isProcessing = false;
    this.playingItem = null;
    this.isPaused = false;

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
      this.lastPlayedItem = this.playingItem;
    }
    this.queue = [];
    this.playingItem = null;
    this.isPaused = false;
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
    this.lastPlayedItem = null;
    this.notify();
  }
}
