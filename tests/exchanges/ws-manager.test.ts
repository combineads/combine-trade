import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { WsManager } from "../../src/exchanges/ws-manager";
import type { WsOptions } from "../../src/exchanges/ws-manager";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WsEventHandler = ((event: MessageEvent) => void) | null;
type WsCloseHandler = ((event: CloseEvent) => void) | null;
type WsOpenHandler = ((event: Event) => void) | null;
type WsErrorHandler = ((event: Event) => void) | null;

/**
 * Minimal WebSocket mock that exposes control methods to simulate
 * open/close/message/error events from tests.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string | string[] | undefined;
  readyState: number = WebSocket.CONNECTING;

  onopen: WsOpenHandler = null;
  onmessage: WsEventHandler = null;
  onclose: WsCloseHandler = null;
  onerror: WsErrorHandler = null;

  sentMessages: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.closedWith = {
      ...(code !== undefined ? { code } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    this.readyState = WebSocket.CLOSED;
    // Trigger onclose if registered (simulate normal close from our side)
    const event = makeMockCloseEvent(code ?? 1000, reason ?? "");
    this.onclose?.(event);
  }

  // -- Test control methods --

  /** Simulate the server accepting the connection */
  simulateOpen(): void {
    this.readyState = WebSocket.OPEN;
    const event = new Event("open");
    this.onopen?.(event);
  }

  /** Simulate the server sending a message */
  simulateMessage(data: string): void {
    const event = new MessageEvent("message", { data });
    this.onmessage?.(event);
  }

  /** Simulate an abnormal close from the server side */
  simulateAbnormalClose(code = 1006): void {
    this.readyState = WebSocket.CLOSED;
    const event = makeMockCloseEvent(code, "abnormal");
    this.onclose?.(event);
  }

  /** Simulate a normal close from the server side */
  simulateNormalClose(code = 1000): void {
    this.readyState = WebSocket.CLOSED;
    const event = makeMockCloseEvent(code, "normal");
    this.onclose?.(event);
  }

  /** Simulate a WebSocket error event */
  simulateError(message = "ws error"): void {
    const event = Object.assign(new Event("error"), { message });
    this.onerror?.(event);
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    const last = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    if (last === undefined) throw new Error("No MockWebSocket instances");
    return last;
  }
}

// Assign WebSocket static constants so the implementation can reference them.
Object.assign(MockWebSocket, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

function makeMockCloseEvent(code: number, reason: string): CloseEvent {
  return new CloseEvent("close", { code, reason, wasClean: code === 1000 });
}

function makeFactory() {
  return (url: string, protocols?: string | string[]): WebSocket =>
    new MockWebSocket(url, protocols) as unknown as WebSocket;
}

// ---------------------------------------------------------------------------
// setTimeout mocking helpers
// ---------------------------------------------------------------------------

type TimerCallback = () => void;

interface CapturedTimer {
  id: number;
  callback: TimerCallback;
  delayMs: number;
  fired: boolean;
}

class FakeTimers {
  private timers: CapturedTimer[] = [];
  private nextId = 1;
  private originalSetTimeout = globalThis.setTimeout;
  private originalClearTimeout = globalThis.clearTimeout;

  install(): void {
    const self = this;
    // @ts-expect-error: replacing global setTimeout for test
    globalThis.setTimeout = (cb: TimerCallback, ms: number): number => {
      const id = self.nextId++;
      self.timers.push({ id, callback: cb, delayMs: ms, fired: false });
      return id;
    };
    // @ts-expect-error: replacing global clearTimeout for test
    globalThis.clearTimeout = (id: number): void => {
      self.timers = self.timers.filter((t) => t.id !== id);
    };
  }

  uninstall(): void {
    globalThis.setTimeout = this.originalSetTimeout;
    globalThis.clearTimeout = this.originalClearTimeout;
  }

  /** Fire all pending timers immediately, in order of registration. */
  flush(): void {
    const pending = [...this.timers].filter((t) => !t.fired);
    for (const timer of pending) {
      timer.fired = true;
      this.timers = this.timers.filter((t) => t.id !== timer.id);
      timer.callback();
    }
  }

  /** Fire only the first pending timer. */
  flushOne(): void {
    const timer = this.timers.find((t) => !t.fired);
    if (timer === undefined) return;
    timer.fired = true;
    this.timers = this.timers.filter((t) => t.id !== timer.id);
    timer.callback();
  }

  /** Get delay of first pending timer. */
  nextDelay(): number | undefined {
    return this.timers[0]?.delayMs;
  }

  pendingCount(): number {
    return this.timers.length;
  }
}

// ---------------------------------------------------------------------------
// Helper — build WsManager with fake WebSocket factory
// ---------------------------------------------------------------------------

function makeManager(): { manager: WsManager; timers: FakeTimers } {
  const timers = new FakeTimers();
  timers.install();
  const manager = new WsManager(makeFactory());
  return { manager, timers };
}

function makeOptions(overrides: Partial<WsOptions> = {}): WsOptions {
  return {
    onMessage: () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.reset();
});

afterEach(() => {
  // Ensure timers are restored if a test installs them
});

describe("ws-manager — connect", () => {
  it("opens a WebSocket to the given url", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());
      const ws = MockWebSocket.latest();
      expect(ws.url).toBe("wss://example.com/stream");
    } finally {
      timers.uninstall();
    }
  });

  it("returns a WsConnection with isConnected=false before open event", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      expect(conn.isConnected).toBe(false);
    } finally {
      timers.uninstall();
    }
  });

  it("isConnected=true after WebSocket fires open event", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      MockWebSocket.latest().simulateOpen();
      expect(conn.isConnected).toBe(true);
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — message delivery", () => {
  it("calls onMessage with the raw string data", () => {
    const received: string[] = [];
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions({ onMessage: (d) => received.push(d) }));
      const ws = MockWebSocket.latest();
      ws.simulateOpen();
      ws.simulateMessage('{"event":"kline"}');
      expect(received).toEqual(['{"event":"kline"}']);
    } finally {
      timers.uninstall();
    }
  });

  it("delivers multiple messages in order", () => {
    const received: string[] = [];
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions({ onMessage: (d) => received.push(d) }));
      const ws = MockWebSocket.latest();
      ws.simulateOpen();
      ws.simulateMessage("msg1");
      ws.simulateMessage("msg2");
      ws.simulateMessage("msg3");
      expect(received).toEqual(["msg1", "msg2", "msg3"]);
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — send", () => {
  it("send() forwards data to the underlying socket", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      const ws = MockWebSocket.latest();
      ws.simulateOpen();
      conn.send("ping");
      expect(ws.sentMessages).toEqual(["ping"]);
    } finally {
      timers.uninstall();
    }
  });

  it("send() throws when socket is not connected", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      expect(() => conn.send("ping")).toThrow();
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — auto-reconnect on abnormal close", () => {
  it("schedules reconnect after first abnormal close (1s delay)", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());
      const ws1 = MockWebSocket.latest();
      ws1.simulateOpen();
      ws1.simulateAbnormalClose(1006);

      expect(timers.pendingCount()).toBe(1);
      expect(timers.nextDelay()).toBe(1_000);
    } finally {
      timers.uninstall();
    }
  });

  it("creates a new socket when reconnect timer fires", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());
      MockWebSocket.latest().simulateOpen();
      MockWebSocket.latest().simulateAbnormalClose(1006);

      const countBefore = MockWebSocket.instances.length;
      timers.flushOne();
      expect(MockWebSocket.instances.length).toBe(countBefore + 1);
    } finally {
      timers.uninstall();
    }
  });

  it("backoff sequence is 1s→2s→4s→8s→16s→30s on consecutive failures", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());
      const delays: number[] = [];

      // Initial connection opens successfully
      MockWebSocket.latest().simulateOpen();

      // 6 consecutive failures without a successful reconnect between them.
      // Each cycle: trigger close → capture delay → fire timer (creates new socket,
      // but we do NOT call simulateOpen, so backoff keeps accumulating).
      for (let i = 0; i < 6; i++) {
        MockWebSocket.latest().simulateAbnormalClose(1006);
        const delay = timers.nextDelay();
        if (delay !== undefined) delays.push(delay);
        timers.flushOne(); // reconnect attempt fires, creates new socket
      }

      expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);
    } finally {
      timers.uninstall();
    }
  });

  it("delay stays at 30s cap after 6+ consecutive failures", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());

      // Initial successful open
      MockWebSocket.latest().simulateOpen();

      // 8 consecutive failures without a successful reconnect
      for (let i = 0; i < 8; i++) {
        MockWebSocket.latest().simulateAbnormalClose(1006);
        timers.flushOne();
      }

      // 9th failure — delay must still be capped at 30s
      MockWebSocket.latest().simulateAbnormalClose(1006);
      expect(timers.nextDelay()).toBe(30_000);
    } finally {
      timers.uninstall();
    }
  });

  it("does not reconnect after normal close (code 1000)", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());
      const ws = MockWebSocket.latest();
      ws.simulateOpen();
      ws.simulateNormalClose(1000);
      expect(timers.pendingCount()).toBe(0);
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — backoff reset on successful reconnect", () => {
  it("resets backoff to 1s after a successful reconnect", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://example.com/stream", makeOptions());

      // Fail twice to advance backoff to 2s
      MockWebSocket.latest().simulateOpen();
      MockWebSocket.latest().simulateAbnormalClose(1006);
      timers.flushOne(); // reconnect after 1s
      MockWebSocket.latest().simulateOpen();
      MockWebSocket.latest().simulateAbnormalClose(1006);
      timers.flushOne(); // reconnect after 2s

      // Now succeed
      MockWebSocket.latest().simulateOpen();

      // Next failure should restart at 1s
      MockWebSocket.latest().simulateAbnormalClose(1006);
      expect(timers.nextDelay()).toBe(1_000);
    } finally {
      timers.uninstall();
    }
  });

  it("calls onReconnect callback after successful reconnect", () => {
    let reconnectCount = 0;
    const { manager, timers } = makeManager();
    try {
      manager.connect(
        "wss://example.com/stream",
        makeOptions({ onReconnect: () => { reconnectCount++; } }),
      );

      // First connection — no onReconnect
      MockWebSocket.latest().simulateOpen();
      expect(reconnectCount).toBe(0);

      // Disconnect and reconnect
      MockWebSocket.latest().simulateAbnormalClose(1006);
      timers.flushOne();
      MockWebSocket.latest().simulateOpen();
      expect(reconnectCount).toBe(1);
    } finally {
      timers.uninstall();
    }
  });

  it("does not call onReconnect on first connection", () => {
    let reconnectCount = 0;
    const { manager, timers } = makeManager();
    try {
      manager.connect(
        "wss://example.com/stream",
        makeOptions({ onReconnect: () => { reconnectCount++; } }),
      );
      MockWebSocket.latest().simulateOpen();
      expect(reconnectCount).toBe(0);
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — intentional close()", () => {
  it("sets isConnected=false after close()", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      MockWebSocket.latest().simulateOpen();
      expect(conn.isConnected).toBe(true);
      conn.close();
      expect(conn.isConnected).toBe(false);
    } finally {
      timers.uninstall();
    }
  });

  it("does NOT schedule reconnect after intentional close()", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      MockWebSocket.latest().simulateOpen();
      conn.close();
      // No pending reconnect timers
      expect(timers.pendingCount()).toBe(0);
    } finally {
      timers.uninstall();
    }
  });

  it("does not reconnect even if a pending timer fires after close()", () => {
    const { manager, timers } = makeManager();
    try {
      const conn = manager.connect("wss://example.com/stream", makeOptions());
      MockWebSocket.latest().simulateOpen();
      MockWebSocket.latest().simulateAbnormalClose(1006); // schedules reconnect
      const instancesBefore = MockWebSocket.instances.length;
      conn.close(); // cancels the timer
      timers.flush(); // flush any residual timers
      expect(MockWebSocket.instances.length).toBe(instancesBefore); // no new socket
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — error callback", () => {
  it("calls onError when a WebSocket error event fires", () => {
    const errors: Error[] = [];
    const { manager, timers } = makeManager();
    try {
      manager.connect(
        "wss://example.com/stream",
        makeOptions({ onError: (e) => errors.push(e) }),
      );
      MockWebSocket.latest().simulateError("connection refused");
      expect(errors).toHaveLength(1);
    } finally {
      timers.uninstall();
    }
  });
});

describe("ws-manager — multiple independent connections", () => {
  it("two connections have independent sockets", () => {
    const { manager, timers } = makeManager();
    try {
      const received1: string[] = [];
      const received2: string[] = [];

      manager.connect("wss://stream1.example.com", makeOptions({ onMessage: (d) => received1.push(d) }));
      const ws1 = MockWebSocket.instances[0];

      manager.connect("wss://stream2.example.com", makeOptions({ onMessage: (d) => received2.push(d) }));
      const ws2 = MockWebSocket.instances[1];

      if (ws1 === undefined || ws2 === undefined) throw new Error("sockets not created");

      ws1.simulateOpen();
      ws2.simulateOpen();

      ws1.simulateMessage("from-stream1");
      ws2.simulateMessage("from-stream2");

      expect(received1).toEqual(["from-stream1"]);
      expect(received2).toEqual(["from-stream2"]);
    } finally {
      timers.uninstall();
    }
  });

  it("disconnecting connection A does not affect connection B", () => {
    const received2: string[] = [];
    const { manager, timers } = makeManager();
    try {
      const connA = manager.connect("wss://stream-a.example.com", makeOptions());
      const wsA = MockWebSocket.instances[0];

      manager.connect(
        "wss://stream-b.example.com",
        makeOptions({ onMessage: (d) => received2.push(d) }),
      );
      const wsB = MockWebSocket.instances[1];

      if (wsA === undefined || wsB === undefined) throw new Error("sockets not created");

      wsA.simulateOpen();
      wsB.simulateOpen();

      // Abnormal close on A
      wsA.simulateAbnormalClose(1006);
      // B continues working
      wsB.simulateMessage("still alive");

      expect(received2).toEqual(["still alive"]);
      expect(connA.isConnected).toBe(false);
    } finally {
      timers.uninstall();
    }
  });

  it("closeAll() closes every active connection", () => {
    const { manager, timers } = makeManager();
    try {
      const conn1 = manager.connect("wss://stream1.example.com", makeOptions());
      const conn2 = manager.connect("wss://stream2.example.com", makeOptions());

      MockWebSocket.instances[0]?.simulateOpen();
      MockWebSocket.instances[1]?.simulateOpen();

      expect(conn1.isConnected).toBe(true);
      expect(conn2.isConnected).toBe(true);
      expect(manager.size).toBe(2);

      manager.closeAll();

      expect(conn1.isConnected).toBe(false);
      expect(conn2.isConnected).toBe(false);
      expect(manager.size).toBe(0);
    } finally {
      timers.uninstall();
    }
  });

  it("closeAll() prevents reconnect for all connections", () => {
    const { manager, timers } = makeManager();
    try {
      manager.connect("wss://stream1.example.com", makeOptions());
      manager.connect("wss://stream2.example.com", makeOptions());

      MockWebSocket.instances[0]?.simulateOpen();
      MockWebSocket.instances[1]?.simulateOpen();

      // Cause abnormal disconnect on both before closeAll
      MockWebSocket.instances[0]?.simulateAbnormalClose(1006);
      MockWebSocket.instances[1]?.simulateAbnormalClose(1006);

      // closeAll cancels pending reconnect timers
      manager.closeAll();
      const instancesBefore = MockWebSocket.instances.length;
      timers.flush();
      expect(MockWebSocket.instances.length).toBe(instancesBefore);
    } finally {
      timers.uninstall();
    }
  });
});
