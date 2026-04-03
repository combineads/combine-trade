import { createLogger } from "@/core/logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options passed to WsManager.connect().
 */
export type WsOptions = {
  /** Called for every message received on this connection. */
  onMessage: (data: string) => void;
  /** Called after a successful reconnect (not on first connect). */
  onReconnect?: () => void;
  /** Called when the underlying WebSocket emits an error event. */
  onError?: (error: Error) => void;
  /** Optional sub-protocols forwarded to the WebSocket constructor. */
  protocols?: string | string[];
};

/**
 * Handle returned by WsManager.connect().
 * Callers use this to send messages, close the connection, and check status.
 */
export type WsConnection = {
  /** Send a text frame. Throws if the socket is not currently open. */
  send(data: string): void;
  /** Intentionally close this connection. Prevents any further reconnect. */
  close(): void;
  /** True while the underlying WebSocket is in OPEN state. */
  readonly isConnected: boolean;
};

// ---------------------------------------------------------------------------
// Internal state per connection
// ---------------------------------------------------------------------------

/** Close codes ≥ 1000 are "normal"; anything else is abnormal (reconnect). */
const NORMAL_CLOSE_CODES = new Set([1000, 1001]);

const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

function backoffMs(attempt: number): number {
  const idx = Math.min(attempt, BACKOFF_STEPS_MS.length - 1);
  // BACKOFF_STEPS_MS is always non-empty so index is always valid
  return BACKOFF_STEPS_MS[idx] as number;
}

// ---------------------------------------------------------------------------
// WebSocket factory — injectable for testing
// ---------------------------------------------------------------------------

export type WebSocketFactory = (url: string, protocols?: string | string[]) => WebSocket;

const defaultWsFactory: WebSocketFactory = (url, protocols) =>
  protocols !== undefined ? new WebSocket(url, protocols) : new WebSocket(url);

// ---------------------------------------------------------------------------
// WsManager
// ---------------------------------------------------------------------------

const logger = createLogger("exchanges");

/**
 * Manages multiple independent WebSocket connections with auto-reconnect
 * and exponential backoff.
 *
 * Each call to connect() returns a WsConnection handle that is independent
 * from all other connections — one failing does not affect the others.
 *
 * Backoff schedule: 1 s → 2 s → 4 s → 8 s → 16 s → 30 s (cap).
 * Resets to 1 s after a successful reconnect.
 */
export class WsManager {
  private readonly connections = new Map<string, WsConnectionInternal>();
  private connectionCounter = 0;
  private readonly wsFactory: WebSocketFactory;

  constructor(wsFactory?: WebSocketFactory) {
    this.wsFactory = wsFactory ?? defaultWsFactory;
  }

  /**
   * Opens a WebSocket connection to `url` and begins managing its lifecycle.
   *
   * Returns a WsConnection handle immediately; the underlying socket connects
   * asynchronously. Callers should wait for the first onMessage or check
   * isConnected before sending.
   */
  connect(url: string, options: WsOptions): WsConnection {
    const id = `ws-${++this.connectionCounter}`;
    const internal = new WsConnectionInternal(id, url, options, this.wsFactory);
    this.connections.set(id, internal);

    // Remove from map when intentionally closed
    const originalClose = internal.close.bind(internal);
    internal.close = () => {
      originalClose();
      this.connections.delete(id);
    };

    internal.open();
    return internal;
  }

  /**
   * Closes all active connections. Intended for daemon shutdown.
   */
  closeAll(): void {
    for (const [, connection] of this.connections) {
      connection.close();
    }
    this.connections.clear();
  }

  /** Number of currently tracked connections (open or reconnecting). */
  get size(): number {
    return this.connections.size;
  }
}

// ---------------------------------------------------------------------------
// WsConnectionInternal — per-connection state machine
// ---------------------------------------------------------------------------

class WsConnectionInternal implements WsConnection {
  private ws: WebSocket | null = null;
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isConnected = false;
  private isFirstConnection = true;

  constructor(
    private readonly id: string,
    private readonly url: string,
    private readonly options: WsOptions,
    private readonly wsFactory: WebSocketFactory,
  ) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  open(): void {
    this.createSocket();
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    if (this.ws !== null) {
      this.ws.close(1000, "intentional close");
    }
    this._isConnected = false;
    logger.info("ws.closed", { details: { id: this.id, url: this.url } });
  }

  send(data: string): void {
    if (this.ws === null || !this._isConnected) {
      throw new Error(`WsConnection[${this.id}]: cannot send — socket is not open`);
    }
    this.ws.send(data);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private createSocket(): void {
    const ws = this.wsFactory(this.url, this.options.protocols);
    this.ws = ws;

    ws.onopen = () => {
      if (this.intentionallyClosed) {
        ws.close(1000, "late open after intentional close");
        return;
      }

      this._isConnected = true;
      const wasReconnect = !this.isFirstConnection;
      this.isFirstConnection = false;

      if (wasReconnect) {
        this.reconnectAttempt = 0; // reset backoff
        logger.info("ws.reconnected", { details: { id: this.id, url: this.url } });
        this.options.onReconnect?.();
      } else {
        logger.info("ws.connected", { details: { id: this.id, url: this.url } });
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
      this.options.onMessage(data);
    };

    ws.onerror = (event: Event) => {
      const error =
        event instanceof ErrorEvent
          ? new Error(event.message)
          : new Error(`WebSocket error on ${this.url}`);
      logger.warn("ws.error", { details: { id: this.id, url: this.url, error: error.message } });
      this.options.onError?.(error);
    };

    ws.onclose = (event: CloseEvent) => {
      this._isConnected = false;

      if (this.intentionallyClosed) {
        return;
      }

      const isNormal = NORMAL_CLOSE_CODES.has(event.code);
      if (isNormal) {
        logger.info("ws.close_normal", {
          details: { id: this.id, url: this.url, code: event.code },
        });
        return;
      }

      // Abnormal close — schedule reconnect
      const delayMs = backoffMs(this.reconnectAttempt);
      logger.warn("ws.disconnected", {
        details: {
          id: this.id,
          url: this.url,
          code: event.code,
          attempt: this.reconnectAttempt,
          nextRetryMs: delayMs,
        },
      });

      this.reconnectAttempt++;
      this.scheduleReconnect(delayMs);
    };
  }

  private scheduleReconnect(delayMs: number): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionallyClosed) {
        return;
      }
      logger.info("ws.reconnecting", {
        details: { id: this.id, url: this.url, attempt: this.reconnectAttempt },
      });
      this.createSocket();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
