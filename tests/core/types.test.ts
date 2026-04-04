import { describe, expect, it } from 'bun:test';
import Decimal from 'decimal.js';
import type {
  Backtest,
  BacktestRunType,
  BlockType,
  Candle,
  CloseReason,
  CommonCode,
  CommonCodeGroup,
  DailyBias,
  DetectionType,
  Direction,
  EventLog,
  Exchange,
  ExecutionMode,
  FsmState,
  KnnDecision,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  Signal,
  SignalDetail,
  SignalType,
  SymbolEntity,
  SymbolKey,
  SymbolState,
  Ticket,
  TicketState,
  Timeframe,
  TradeBlock,
  TradeResult,
  Vector,
  VectorGrade,
  VectorTimeframe,
  WatchSession,
} from '@/core/types';

// ---------------------------------------------------------------------------
// Runtime value tests
// ---------------------------------------------------------------------------

describe('core/types — enum runtime values', () => {
  it('FsmState values are correct', () => {
    const values: FsmState[] = ['IDLE', 'WATCHING', 'HAS_POSITION'];
    expect(values).toHaveLength(3);
    expect(values).toContain('IDLE');
    expect(values).toContain('WATCHING');
    expect(values).toContain('HAS_POSITION');
  });

  it('ExecutionMode values are correct', () => {
    const values: ExecutionMode[] = ['analysis', 'alert', 'live'];
    expect(values).toHaveLength(3);
  });

  it('DailyBias values are correct', () => {
    const values: DailyBias[] = ['LONG_ONLY', 'SHORT_ONLY', 'NEUTRAL'];
    expect(values).toHaveLength(3);
  });

  it('Timeframe values are correct', () => {
    const values: Timeframe[] = ['1D', '1H', '5M', '1M'];
    expect(values).toHaveLength(4);
  });

  it('VectorTimeframe is subset of Timeframe', () => {
    const values: VectorTimeframe[] = ['5M', '1M'];
    expect(values).toHaveLength(2);
  });

  it('Direction values are correct', () => {
    const values: Direction[] = ['LONG', 'SHORT'];
    expect(values).toHaveLength(2);
  });

  it('Exchange values are correct', () => {
    const values: Exchange[] = ['binance', 'okx', 'bitget', 'mexc'];
    expect(values).toHaveLength(4);
  });

  it('DetectionType values are correct', () => {
    const values: DetectionType[] = [
      'SQUEEZE_BREAKOUT',
      'SR_CONFLUENCE',
      'BB4_TOUCH',
    ];
    expect(values).toHaveLength(3);
  });

  it('SignalType values are correct', () => {
    const values: SignalType[] = ['DOUBLE_B', 'ONE_B'];
    expect(values).toHaveLength(2);
  });

  it('KnnDecision values are correct', () => {
    const values: KnnDecision[] = ['PASS', 'FAIL', 'SKIP'];
    expect(values).toHaveLength(3);
  });

  it('TicketState values are correct', () => {
    const values: TicketState[] = ['INITIAL', 'TP1_HIT', 'TP2_HIT', 'CLOSED'];
    expect(values).toHaveLength(4);
  });

  it('CloseReason values are correct', () => {
    const values: CloseReason[] = [
      'SL',
      'TP1',
      'TP2',
      'TRAILING',
      'TIME_EXIT',
      'PANIC_CLOSE',
      'MANUAL',
    ];
    expect(values).toHaveLength(7);
  });

  it('TradeResult values are correct', () => {
    const values: TradeResult[] = ['WIN', 'LOSS', 'TIME_EXIT'];
    expect(values).toHaveLength(3);
  });

  it('VectorGrade values are correct', () => {
    const values: VectorGrade[] = ['A', 'B', 'C'];
    expect(values).toHaveLength(3);
  });

  it('OrderType values are correct', () => {
    const values: OrderType[] = [
      'ENTRY',
      'SL',
      'TP1',
      'TP2',
      'TRAILING',
      'PYRAMID',
      'PANIC_CLOSE',
      'TIME_EXIT',
    ];
    expect(values).toHaveLength(8);
  });

  it('OrderStatus values are correct', () => {
    const values: OrderStatus[] = [
      'PENDING',
      'FILLED',
      'PARTIALLY_FILLED',
      'CANCELLED',
      'FAILED',
    ];
    expect(values).toHaveLength(5);
  });

  it('OrderSide values are correct', () => {
    const values: OrderSide[] = ['BUY', 'SELL'];
    expect(values).toHaveLength(2);
  });

  it('BlockType values are correct', () => {
    const values: BlockType[] = [
      'ECONOMIC',
      'FUNDING',
      'MANUAL',
      'MARKET_OPEN',
    ];
    expect(values).toHaveLength(4);
  });

  it('BacktestRunType values are correct', () => {
    const values: BacktestRunType[] = ['BACKTEST', 'WFO'];
    expect(values).toHaveLength(2);
  });

  it('CommonCodeGroup values are correct', () => {
    const values: CommonCodeGroup[] = [
      'EXCHANGE',
      'TIMEFRAME',
      'SYMBOL_CONFIG',
      'KNN',
      'POSITION',
      'LOSS_LIMIT',
      'SLIPPAGE',
      'FEATURE_WEIGHT',
      'TIME_DECAY',
      'WFO',
      'ANCHOR',
      'NOTIFICATION',
    ];
    expect(values).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// Runtime entity construction tests
// ---------------------------------------------------------------------------

describe('core/types — entity construction', () => {
  it('Symbol can be constructed with valid fields', () => {
    const sym: SymbolEntity = {
      symbol: 'BTCUSDT',
      exchange: 'binance',
      name: 'BTC/USDT',
      base_asset: 'BTC',
      quote_asset: 'USDT',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(sym.symbol).toBe('BTCUSDT');
    expect(sym.exchange).toBe('binance');
  });

  it('SymbolState accepts null for nullable fields', () => {
    const state: SymbolState = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      fsm_state: 'IDLE',
      execution_mode: 'analysis',
      daily_bias: null,
      daily_open: null,
      session_box_high: null,
      session_box_low: null,
      losses_today: new Decimal(0),
      losses_session: 0,
      losses_this_1h_5m: 0,
      losses_this_1h_1m: 0,
      updated_at: new Date(),
    };
    expect(state.daily_bias).toBeNull();
    expect(state.daily_open).toBeNull();
  });

  it('SymbolState accepts non-null Decimal for price fields', () => {
    const state: SymbolState = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      fsm_state: 'WATCHING',
      execution_mode: 'live',
      daily_bias: 'LONG_ONLY',
      daily_open: new Decimal('65000.00'),
      session_box_high: new Decimal('65500.00'),
      session_box_low: new Decimal('64800.00'),
      losses_today: new Decimal('150.50'),
      losses_session: 1,
      losses_this_1h_5m: 0,
      losses_this_1h_1m: 0,
      updated_at: new Date(),
    };
    expect(state.daily_open?.toString()).toBe('65000');
  });

  it('CommonCode can be constructed', () => {
    const code: CommonCode = {
      group_code: 'KNN',
      code: 'top_k',
      value: 50,
      description: 'KNN top-K parameter',
      sort_order: 1,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(code.group_code).toBe('KNN');
  });

  it('TradeBlock can be constructed with nullable fields as null', () => {
    const block: TradeBlock = {
      id: 'uuid-1',
      block_type: 'MARKET_OPEN',
      start_time: new Date(),
      end_time: new Date(),
      reason: null,
      is_recurring: true,
      recurrence_rule: { utc_hour: 0, duration_min: 120 },
      source_data: null,
      created_at: new Date(),
    };
    expect(block.reason).toBeNull();
  });

  it('Candle uses Decimal for price fields', () => {
    const candle: Candle = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      timeframe: '5M',
      open_time: new Date(),
      open: new Decimal('65000'),
      high: new Decimal('65200'),
      low: new Decimal('64900'),
      close: new Decimal('65100'),
      volume: new Decimal('10.5'),
      is_closed: true,
      created_at: new Date(),
    };
    expect(candle.open).toBeInstanceOf(Decimal);
    expect(candle.high).toBeInstanceOf(Decimal);
  });

  it('WatchSession has nullable invalidated_at and tp prices', () => {
    const session: WatchSession = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      detection_type: 'BB4_TOUCH',
      direction: 'LONG',
      tp1_price: null,
      tp2_price: null,
      detected_at: new Date(),
      invalidated_at: null,
      invalidation_reason: null,
      context_data: null,
      created_at: new Date(),
    };
    expect(session.invalidated_at).toBeNull();
  });

  it('Signal has nullable knn_decision and vector_id', () => {
    const signal: Signal = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      watch_session_id: 'uuid-ws',
      timeframe: '5M',
      signal_type: 'DOUBLE_B',
      direction: 'LONG',
      entry_price: new Decimal('65000'),
      sl_price: new Decimal('64500'),
      safety_passed: true,
      knn_decision: null,
      a_grade: false,
      vector_id: null,
      created_at: new Date(),
    };
    expect(signal.knn_decision).toBeNull();
    expect(signal.vector_id).toBeNull();
  });

  it('SignalDetail has nullable value and text_value', () => {
    const detail: SignalDetail = {
      id: 'uuid-1',
      signal_id: 'uuid-s',
      key: 'daily_bias',
      value: null,
      text_value: 'LONG_ONLY',
    };
    expect(detail.value).toBeNull();
    expect(detail.text_value).toBe('LONG_ONLY');
  });

  it('Vector has Float32Array embedding', () => {
    const vec: Vector = {
      id: 'uuid-1',
      candle_id: 'uuid-c',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      timeframe: '5M',
      embedding: new Float32Array(202),
      label: null,
      grade: null,
      labeled_at: null,
      created_at: new Date(),
    };
    expect(vec.embedding).toBeInstanceOf(Float32Array);
    expect(vec.embedding.length).toBe(202);
  });

  it('Ticket uses Decimal for price and size fields', () => {
    const ticket: Ticket = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      signal_id: 'uuid-s',
      parent_ticket_id: null,
      timeframe: '5M',
      direction: 'LONG',
      state: 'INITIAL',
      entry_price: new Decimal('65000'),
      sl_price: new Decimal('64500'),
      current_sl_price: new Decimal('64500'),
      size: new Decimal('0.1'),
      remaining_size: new Decimal('0.1'),
      leverage: 10,
      tp1_price: new Decimal('65500'),
      tp2_price: new Decimal('66000'),
      trailing_active: false,
      trailing_price: null,
      max_profit: new Decimal('0'),
      pyramid_count: 0,
      opened_at: new Date(),
      closed_at: null,
      close_reason: null,
      result: null,
      pnl: null,
      pnl_pct: null,
      max_favorable: null,
      max_adverse: null,
      hold_duration_sec: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(ticket.entry_price).toBeInstanceOf(Decimal);
    expect(ticket.result).toBeNull();
  });

  it('Order has nullable ticket_id for panic-close orders', () => {
    const order: Order = {
      id: 'uuid-1',
      ticket_id: null,
      exchange: 'binance',
      order_type: 'PANIC_CLOSE',
      status: 'FILLED',
      side: 'SELL',
      price: null,
      expected_price: new Decimal('65000'),
      size: new Decimal('0.1'),
      filled_price: new Decimal('64990'),
      filled_size: new Decimal('0.1'),
      exchange_order_id: 'binance-123',
      intent_id: 'intent-uuid',
      idempotency_key: 'idem-uuid',
      slippage: new Decimal('-10'),
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(order.ticket_id).toBeNull();
    expect(order.slippage).toBeInstanceOf(Decimal);
  });

  it('Backtest has nullable parent_id and window_index', () => {
    const bt: Backtest = {
      id: 'uuid-1',
      run_type: 'BACKTEST',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      config_snapshot: { knn_top_k: 50 },
      results: { total_trades: 150, win_rate: 0.62 },
      parent_id: null,
      window_index: null,
      created_at: new Date(),
    };
    expect(bt.parent_id).toBeNull();
    expect(bt.window_index).toBeNull();
  });

  it('EventLog has nullable symbol, exchange, ref fields', () => {
    const log: EventLog = {
      id: 'uuid-1',
      event_type: 'BIAS_CHANGE',
      symbol: null,
      exchange: null,
      ref_id: null,
      ref_type: null,
      data: null,
      created_at: new Date(),
    };
    expect(log.symbol).toBeNull();
    expect(log.exchange).toBeNull();
  });

  it('SymbolKey composite type has both fields', () => {
    const key: SymbolKey = {
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };
    expect(key.symbol).toBe('BTCUSDT');
    expect(key.exchange).toBe('binance');
  });
});

// ---------------------------------------------------------------------------
// Compile-time type safety verification (using @ts-expect-error)
// ---------------------------------------------------------------------------

describe('core/types — compile-time type safety', () => {
  it('invalid FsmState value is rejected at compile time', () => {
    // @ts-expect-error — 'INVALID' is not a valid FsmState
    const _bad: FsmState = 'INVALID';
    expect(true).toBe(true); // test passes if compilation succeeds with @ts-expect-error
  });

  it('number is not assignable to Decimal price field in Candle', () => {
    // @ts-expect-error — number is not assignable to Decimal
    const _bad: Candle = {
      id: 'uuid',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      timeframe: '5M',
      open_time: new Date(),
      open: 65000, // should be Decimal
      high: new Decimal('65200'),
      low: new Decimal('64900'),
      close: new Decimal('65100'),
      volume: new Decimal('10.5'),
      is_closed: true,
      created_at: new Date(),
    };
    expect(true).toBe(true);
  });

  it('null is not assignable to non-nullable required field', () => {
    // @ts-expect-error — null is not assignable to string (symbol field is required)
    const _bad: SymbolEntity = {
      symbol: null,
      exchange: 'binance',
      name: 'BTC/USDT',
      base_asset: 'BTC',
      quote_asset: 'USDT',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(true).toBe(true);
  });

  it('invalid Exchange value is rejected at compile time', () => {
    // @ts-expect-error — 'kraken' is not a valid Exchange
    const _bad: Exchange = 'kraken';
    expect(true).toBe(true);
  });

  it('invalid Timeframe value is rejected at compile time', () => {
    // @ts-expect-error — '15M' is not a valid Timeframe
    const _bad: Timeframe = '15M';
    expect(true).toBe(true);
  });

  it('missing required fields in Symbol fail at compile time', () => {
    // @ts-expect-error — missing required fields (name, base_asset, etc.)
    const _bad: SymbolEntity = {
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };
    expect(true).toBe(true);
  });

  it('number is not assignable to Decimal size field in Ticket', () => {
    const validTicket: Ticket = {
      id: 'uuid-1',
      symbol: 'BTCUSDT',
      exchange: 'binance',
      signal_id: 'uuid-s',
      parent_ticket_id: null,
      timeframe: '5M',
      direction: 'LONG',
      state: 'INITIAL',
      entry_price: new Decimal('65000'),
      sl_price: new Decimal('64500'),
      current_sl_price: new Decimal('64500'),
      size: new Decimal('0.1'),
      remaining_size: new Decimal('0.1'),
      leverage: 10,
      tp1_price: null,
      tp2_price: null,
      trailing_active: false,
      trailing_price: null,
      max_profit: new Decimal('0'),
      pyramid_count: 0,
      opened_at: new Date(),
      closed_at: null,
      close_reason: null,
      result: null,
      pnl: null,
      pnl_pct: null,
      max_favorable: null,
      max_adverse: null,
      hold_duration_sec: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // @ts-expect-error — number is not assignable to Decimal
    const _bad: Ticket = { ...validTicket, size: 0.1 };
    expect(true).toBe(true);
  });

  it('invalid TicketState value is rejected at compile time', () => {
    // @ts-expect-error — 'OPEN' is not a valid TicketState
    const _bad: TicketState = 'OPEN';
    expect(true).toBe(true);
  });

  it('invalid CommonCodeGroup value is rejected at compile time', () => {
    // @ts-expect-error — 'CONFIG' is not a valid CommonCodeGroup
    const _bad: CommonCodeGroup = 'CONFIG';
    expect(true).toBe(true);
  });
});
