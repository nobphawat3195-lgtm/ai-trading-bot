//+------------------------------------------------------------------+
//|  VWSR Zone Breakout EA — Gold XAUUSD Scalper                     |
//|  Based on: Volume-Weighted S/R Zones [WillyAlgoTrader] v1.4.3    |
//|  Platform: MT5 | Symbol: XAUUSDm | TF: M15                       |
//|  v1.01 — Fixed: Pivot detection, Zone init scan, Same-bar guard  |
//+------------------------------------------------------------------+
//  SPREAD MATH CHECK (Exness ~308 pts):
//    TP1 min  = 308 × 2.0  = 616 pts  → EA uses ATR-based TP ~1.0R ≥ 800 pts ✅
//    SL min   = 308 × 1.5  = 462 pts  → EA uses Zone-aware SL  ≥ 600 pts ✅
//    ATR M15  = ~1000-2000 pts         → >> Spread × 2.5 = 770  ✅
//    Signal   = Zone Break + Volume    → 8-15 trades/day on M15  (quality > qty)
//+------------------------------------------------------------------+
#property copyright "VWSR EA — Based on WillyAlgoTrader Logic"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

//===================================================================
// SECTION 1: INPUT PARAMETERS
//===================================================================

//--- EA Identity
input group "=== EA Identity ==="
input int      InpMagicNumber   = 202501;    // Magic Number
input string   InpEAComment     = "VWSR_EA"; // Order Comment

//--- Zone Detection Settings
input group "=== Zone Detection ==="
input int      InpPivotLookback = 5;         // Pivot Lookback (bars each side) — 3-5 for scalping
input int      InpMaxZones      = 8;         // Max Active Zones to Track
input double   InpMergeATR      = 0.5;       // Zone Merge Distance (×ATR)
input double   InpMinScore      = 15.0;      // Min Zone Score to Trade
input int      InpATRLen        = 14;        // ATR Length
input int      InpVolLookback   = 20;        // Volume Average Lookback (bars)
input int      InpReactionBars  = 5;         // Reaction Bars After Pivot

//--- Signal Filter Settings
input group "=== Signal Filters ==="
input bool     InpUseVolFilter  = true;      // Require Volume > Avg on Break
input double   InpVolMult       = 1.3;       // Volume Multiplier (×avg)
input bool     InpUseMomFilter  = true;      // Require Momentum (candle range) Filter
input double   InpMomMult       = 0.8;       // Momentum Multiplier (×ATR) — 0.8 for scalping
input int      InpRetestMinBars = 2;         // Min Bars Before Retest Valid
input int      InpRetestMaxBars = 20;        // Max Bars for Retest Window
input double   InpRetestReact   = 0.4;       // Min Retest Bounce (×ATR)
input bool     InpTradeBreaks   = true;      // Trade Breakout Signals
input bool     InpTradeRetests  = true;      // Trade Retest Signals

//--- Spread & Timing Filter
input group "=== Spread & Timing ==="
input int      InpMaxSpreadPts  = 500;       // Max Spread (pts) — skip if wider
// No Session Filter — 24hr trading as per project requirement

//--- Risk Management
input group "=== Risk Management ==="
input double   InpRiskPercent   = 1.0;       // Risk % per Trade (RISK_MEDIUM)
input double   InpSLMultATR     = 1.5;       // SL Distance (×ATR) — fallback if no zone
input double   InpTP1R          = 1.0;       // TP1 R-Multiple
input double   InpTP2R          = 2.0;       // TP2 R-Multiple
input double   InpTP3R          = 3.0;       // TP3 R-Multiple
input bool     InpUseZoneSL     = true;      // Zone-Aware SL (SL behind broken zone)
input double   InpMaxLot        = 0.10;      // Max Lot Size (hard cap)
input double   InpMinLot        = 0.01;      // Min Lot Size

//--- Trade Management
input group "=== Trade Management ==="
input bool     InpUsePartialTP  = true;      // Partial Close at TP1 (50%)
input bool     InpUseBreakEven  = true;      // Breakeven After TP1 Hit
input bool     InpUseTrailing   = true;      // Trailing Stop After TP1
input double   InpTrailATRMult  = 1.0;       // Trailing Stop Distance (×ATR)
input bool     InpUseBasketClose= true;      // Basket Close All on Daily Target
input double   InpDailyTargetR  = 5.0;       // Daily Profit Target (R-multiples)
input double   InpDailyMaxLossR = 3.0;       // Daily Max Loss (R-multiples) — halt after
input int      InpMaxTradesDay  = 20;        // Max Trades Per Day

//===================================================================
// SECTION 2: ZONE DATA STRUCTURE
//===================================================================

//--- Zone type constants
#define ZONE_RESISTANCE  1
#define ZONE_SUPPORT    -1
#define MAX_ZONES       20    // Array hard cap

struct ZoneData
{
   double   top;          // Zone upper boundary
   double   bot;          // Zone lower boundary
   double   score;        // Strength score 0-100
   int      created;      // Bar index when created
   int      ztype;        // ZONE_RESISTANCE or ZONE_SUPPORT
   int      touches;      // Merge/touch count
   bool     broken;       // Has price broken through?
   int      brokenBar;    // Bar index of break
   bool     mitigated;    // Already retested once?
};

//===================================================================
// SECTION 3: GLOBAL VARIABLES
//===================================================================

CTrade         g_trade;
CPositionInfo  g_pos;

//--- Zone storage arrays
ZoneData       g_zones[MAX_ZONES];
int            g_zoneCount = 0;

//--- Indicator handles
int            g_hATR;          // ATR indicator handle

//--- Last break tracking (mirrors Pine variable set)
double         g_lastBreakZoneTop  = 0;
double         g_lastBreakZoneBot  = 0;
double         g_lastBreakScore    = 0;
int            g_lastBreakDir      = 0;  // 1 = bull break, -1 = bear break
int            g_lastBreakBar      = 0;
bool           g_lastBreakRetested = false;

//--- Position tracking
ulong          g_ticket1           = 0;   // Full position ticket
ulong          g_ticket2           = 0;   // Second half (after partial TP)
bool           g_tp1Hit            = false;
bool           g_tp2Hit            = false;
double         g_entryPrice        = 0;
double         g_slPrice           = 0;
double         g_tp1Price          = 0;
double         g_tp2Price          = 0;
double         g_tp3Price          = 0;
int            g_tradeDir          = 0;   // 1 long, -1 short, 0 none
double         g_riskAmount        = 0;   // $ risk for this trade

//--- Daily stats
int            g_todayTrades       = 0;
double         g_todayPnL          = 0;
double         g_dailyRiskBase     = 0;   // Account balance at day start
datetime       g_lastDayReset      = 0;

//--- Last processed bar
datetime       g_lastBarTime       = 0;

//===================================================================
// SECTION 4: INITIALIZATION
//===================================================================

int OnInit()
{
   //--- Setup trade object
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetTypeFilling(ORDER_FILLING_IOC);

   //--- Create ATR handle (M15)
   g_hATR = iATR(_Symbol, PERIOD_M15, InpATRLen);
   if(g_hATR == INVALID_HANDLE)
   {
      Print("ERROR: Cannot create ATR handle");
      return INIT_FAILED;
   }

   //--- Initialize zone array
   ArrayInitialize_Zones();

   //--- Reset daily counters
   ResetDailyStats();

   Print("VWSR EA initialized. Magic=", InpMagicNumber,
         " MaxLot=", InpMaxLot, " Risk=", InpRiskPercent, "%");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(g_hATR != INVALID_HANDLE)
      IndicatorRelease(g_hATR);
   Comment("");
}

//--- Clear all zones
void ArrayInitialize_Zones()
{
   g_zoneCount = 0;
   for(int i = 0; i < MAX_ZONES; i++)
   {
      g_zones[i].top       = 0;
      g_zones[i].bot       = 0;
      g_zones[i].score     = 0;
      g_zones[i].created   = 0;
      g_zones[i].ztype     = 0;
      g_zones[i].touches   = 0;
      g_zones[i].broken    = false;
      g_zones[i].brokenBar = 0;
      g_zones[i].mitigated = false;
   }
}

//===================================================================
// SECTION 5: ZONE DETECTION HELPERS
//===================================================================

//--- Get ATR value at a specific bar shift
double GetATR(int shift)
{
   double buf[1];
   if(CopyBuffer(g_hATR, 0, shift, 1, buf) < 1)
      return 0;
   return buf[0];
}

//--- Get volume SMA (average of InpVolLookback bars BEFORE shift)
double GetVolAvg(int shift)
{
   double total = 0;
   int    count = 0;
   for(int i = shift + 1; i <= shift + InpVolLookback; i++)
   {
      long vol = iVolume(_Symbol, PERIOD_M15, i);
      if(vol > 0) { total += vol; count++; }
   }
   return count > 0 ? total / count : 0;
}

//--- Volume score contribution (0-40 pts)
double CalcVolScore(int shift)
{
   double pivVol = (double)iVolume(_Symbol, PERIOD_M15, shift);
   double avgVol = GetVolAvg(shift);
   if(avgVol <= 0) return 20.0;
   double ratio  = pivVol / avgVol;
   return MathMin(40.0, MathMax(0.0, ratio * 20.0));
}

//--- Reaction score: how much price moved away from pivot (0-30 pts)
double CalcReactionScore(int shift, double pivPrice, bool isResist)
{
   double atr    = GetATR(shift);
   if(atr <= 0) return 0;
   double maxMove = 0;
   int    loopEnd = MathMin(InpReactionBars, shift);
   for(int i = 1; i <= loopEnd; i++)
   {
      double ext  = isResist ? iLow(_Symbol,  PERIOD_M15, shift - i)
                             : iHigh(_Symbol, PERIOD_M15, shift - i);
      double move = isResist ? (pivPrice - ext) : (ext - pivPrice);
      if(move > maxMove) maxMove = move;
   }
   double moveATR = maxMove / atr;
   return MathMin(30.0, MathMax(0.0, moveATR * 10.0));
}

//--- Detect pivot high/low using lookback bars on each side
//    shift+i = older bars (further right on chart = higher shift number)
//    shift-i = newer bars (closer to current = lower shift number)
//    Pivot is valid only if it's the highest/lowest among all neighbours
double DetectPivotHigh(int shift)
{
   double ph = iHigh(_Symbol, PERIOD_M15, shift);
   if(ph <= 0) return 0;
   for(int i = 1; i <= InpPivotLookback; i++)
   {
      // newer side (shift-i): bars closer to current bar
      if(shift - i >= 0 && iHigh(_Symbol, PERIOD_M15, shift - i) >= ph) return 0;
      // older side (shift+i): bars further back in history
      if(iHigh(_Symbol, PERIOD_M15, shift + i) >= ph) return 0;
   }
   return ph;
}

double DetectPivotLow(int shift)
{
   double pl = iLow(_Symbol, PERIOD_M15, shift);
   if(pl <= 0) return 0;
   for(int i = 1; i <= InpPivotLookback; i++)
   {
      if(shift - i >= 0 && iLow(_Symbol, PERIOD_M15, shift - i) <= pl) return 0;
      if(iLow(_Symbol, PERIOD_M15, shift + i) <= pl) return 0;
   }
   return pl;
}

//===================================================================
// SECTION 6: ADD / MERGE ZONE
//===================================================================

void AddZone(double price, int ztype, int barShift)
{
   double atr      = GetATR(barShift);
   if(atr <= 0) return;

   double vScore   = CalcVolScore(barShift);
   double rScore   = CalcReactionScore(barShift, price, ztype == ZONE_RESISTANCE);
   double baseScore= MathMin(100.0, vScore + rScore + 10.0);
   double mergeDist= atr * InpMergeATR;

   //--- Check if close zone of same type exists (merge)
   int mergeIdx = -1;
   for(int i = 0; i < g_zoneCount; i++)
   {
      if(g_zones[i].ztype == ztype && !g_zones[i].broken)
      {
         double mid = (g_zones[i].top + g_zones[i].bot) / 2.0;
         if(MathAbs(mid - price) <= mergeDist)
         {
            mergeIdx = i;
            break;
         }
      }
   }

   if(mergeIdx >= 0)
   {
      //--- Merge: expand zone + boost score
      g_zones[mergeIdx].top    = MathMax(g_zones[mergeIdx].top, price);
      g_zones[mergeIdx].bot    = MathMin(g_zones[mergeIdx].bot, price);
      g_zones[mergeIdx].touches++;
      double touchBonus = MathMin(20.0, MathSqrt((double)g_zones[mergeIdx].touches) * 4.0);
      g_zones[mergeIdx].score  = MathMin(100.0,
         g_zones[mergeIdx].score + baseScore * 0.3 + touchBonus * 0.5);
   }
   else
   {
      //--- New zone — remove weakest if at cap
      if(g_zoneCount >= MathMin(InpMaxZones, MAX_ZONES - 1))
         RemoveWeakestZone();

      if(g_zoneCount < MAX_ZONES)
      {
         int idx = g_zoneCount;
         g_zones[idx].top       = price + atr * 0.15;
         g_zones[idx].bot       = price - atr * 0.15;
         g_zones[idx].score     = baseScore;
         g_zones[idx].created   = iBars(_Symbol, PERIOD_M15) - barShift;
         g_zones[idx].ztype     = ztype;
         g_zones[idx].touches   = 1;
         g_zones[idx].broken    = false;
         g_zones[idx].brokenBar = 0;
         g_zones[idx].mitigated = false;
         g_zoneCount++;
      }
   }
}

//--- Remove zone with lowest score (called when at capacity)
void RemoveWeakestZone()
{
   if(g_zoneCount <= 0) return;
   int    minIdx = 0;
   double minScr = g_zones[0].score;
   for(int i = 1; i < g_zoneCount; i++)
      if(g_zones[i].score < minScr) { minScr = g_zones[i].score; minIdx = i; }

   //--- Shift array left
   for(int i = minIdx; i < g_zoneCount - 1; i++)
      g_zones[i] = g_zones[i + 1];
   g_zoneCount--;
}

//===================================================================
// SECTION 7: ZONE CLEANUP (Age decay + stale removal)
//===================================================================

void UpdateZoneDecay(int currentBars)
{
   double decayPerBar = 0.5 * 0.1;   // ageDecayInput=0.5 × 0.1
   for(int i = g_zoneCount - 1; i >= 0; i--)
   {
      //--- Apply score decay
      g_zones[i].score = MathMax(0.0, g_zones[i].score - decayPerBar);

      //--- Remove criteria
      int age         = currentBars - g_zones[i].created;
      bool tooOld     = age > 30 * 24 * 4;    // ~30 days in M15 bars
      bool tooWeak    = g_zones[i].score < 5.0;
      int  barsSinceBreak = g_zones[i].broken ? currentBars - g_zones[i].brokenBar : 0;
      bool brokenStale    = g_zones[i].broken && barsSinceBreak > InpRetestMaxBars * 2;

      if(tooOld || tooWeak || brokenStale)
         RemoveZoneAt(i);
   }
}

//--- Remove zone at index i, shift array left
void RemoveZoneAt(int idx)
{
   if(idx < 0 || idx >= g_zoneCount) return;
   for(int i = idx; i < g_zoneCount - 1; i++)
      g_zones[i] = g_zones[i + 1];
   g_zoneCount--;
}

//===================================================================
//===================================================================
// SECTION 8: MAIN OnTick — BAR-BY-BAR LOGIC
//===================================================================

void OnTick()
{
   //--- Only process on new M15 bar close (bar-confirmed logic, no repaint)
   datetime curBarTime = iTime(_Symbol, PERIOD_M15, 1);
   if(curBarTime == g_lastBarTime) return;
   g_lastBarTime = curBarTime;

   //--- Daily counter reset at new day
   CheckDayReset();

   //--- Warmup check: need enough bars for ATR + Pivot
   int totalBars = iBars(_Symbol, PERIOD_M15);
   int warmup    = InpPivotLookback * 2 + InpATRLen + InpVolLookback + 5;
   if(totalBars < warmup) return;

   //--- Daily loss / trade limit protection
   if(IsDailyLimitHit()) return;

   //--- Spread filter — skip if too wide
   double spreadPts = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spreadPts > InpMaxSpreadPts)
   {
      UpdateDashboard("SPREAD TOO WIDE");
      return;
   }

   //--- Step 1: Build / update zone list
   //    On first run (g_zoneCount==0): scan back 200 bars to load historical zones
   //    On subsequent runs: only check the newly confirmed pivot bar
   if(g_zoneCount == 0)
   {
      int scanBars = MathMin(200, totalBars - warmup);
      for(int b = InpPivotLookback + 1; b <= scanBars; b++)
      {
         double ph2 = DetectPivotHigh(b);
         double pl2 = DetectPivotLow(b);
         if(ph2 > 0) AddZone(ph2, ZONE_RESISTANCE, b);
         if(pl2 > 0) AddZone(pl2, ZONE_SUPPORT,    b);
      }
      Print("Zone init scan: loaded ", g_zoneCount, " zones from history");
   }
   else
   {
      // Normal per-bar: check the pivot that just confirmed (lookback+1 bars ago)
      int pivotShift = InpPivotLookback + 1;
      double ph = DetectPivotHigh(pivotShift);
      double pl = DetectPivotLow(pivotShift);
      if(ph > 0) AddZone(ph, ZONE_RESISTANCE, pivotShift);
      if(pl > 0) AddZone(pl, ZONE_SUPPORT,    pivotShift);
   }

   //--- Step 2: Age decay and cleanup
   UpdateZoneDecay(totalBars);

   //--- Step 3: Manage existing trades (TP / BE / Trailing)
   ManageOpenTrades();

   //--- Step 4: Signal detection — only if no open trade
   if(g_tradeDir != 0) { UpdateDashboard("TRADE ACTIVE"); return; }

   //--- Check for break and retest signals
   bool sigBreakBull  = false;
   bool sigBreakBear  = false;
   bool sigRetestBull = false;
   bool sigRetestBear = false;

   DetectBreaks(sigBreakBull, sigBreakBear);
   DetectRetests(sigRetestBull, sigRetestBear);

   // Debug: print zone count and signal status every bar
   PrintFormat("BAR | Zones:%d  BreakBull:%s  BreakBear:%s  RetestBull:%s  RetestBear:%s  Spread:%.0f",
      g_zoneCount,
      sigBreakBull  ? "YES" : "no",
      sigBreakBear  ? "YES" : "no",
      sigRetestBull ? "YES" : "no",
      sigRetestBear ? "YES" : "no",
      SymbolInfoInteger(_Symbol, SYMBOL_SPREAD));

   //--- Step 5: Execute entry
   double closeBar1 = iClose(_Symbol, PERIOD_M15, 1); // Confirmed close (Shift 1)
   double atr       = GetATR(1);

   if(InpTradeBreaks && sigBreakBull)
      ExecuteEntry(ORDER_TYPE_BUY, closeBar1, atr, "BRK_BULL");
   else if(InpTradeBreaks && sigBreakBear)
      ExecuteEntry(ORDER_TYPE_SELL, closeBar1, atr, "BRK_BEAR");
   else if(InpTradeRetests && sigRetestBull)
      ExecuteEntry(ORDER_TYPE_BUY, closeBar1, atr, "RT_BULL");
   else if(InpTradeRetests && sigRetestBear)
      ExecuteEntry(ORDER_TYPE_SELL, closeBar1, atr, "RT_BEAR");

   UpdateDashboard("SCANNING");
}

//===================================================================
// SECTION 9: BREAK SIGNAL DETECTION
//===================================================================

//--- Detect zone breakouts (confirmed on bar close, Shift 1)
void DetectBreaks(bool &bullBreak, bool &bearBreak)
{
   double closeNow  = iClose(_Symbol, PERIOD_M15, 1);
   double closePrev = iClose(_Symbol, PERIOD_M15, 2);
   double atr       = GetATR(1);
   long   volNow    = iVolume(_Symbol, PERIOD_M15, 1);
   double volAvg    = GetVolAvg(1);
   double rangeNow  = iHigh(_Symbol, PERIOD_M15, 1) - iLow(_Symbol, PERIOD_M15, 1);

   //--- Volume filter check
   bool volPass = true;
   if(InpUseVolFilter && volAvg > 0)
      volPass = (volNow >= volAvg * InpVolMult);

   //--- Momentum filter check
   bool momPass = true;
   if(InpUseMomFilter && atr > 0)
      momPass = (rangeNow >= atr * InpMomMult);

   if(!volPass || !momPass) return;

   //--- Scan all unbroken zones (skip zones created on THIS bar — can't break same bar)
   int currentBars = iBars(_Symbol, PERIOD_M15);
   for(int i = 0; i < g_zoneCount; i++)
   {
      if(g_zones[i].broken) continue;
      if(g_zones[i].score < InpMinScore) continue;
      if(g_zones[i].created >= currentBars - 1) continue;  // Bug3 fix: skip brand-new zones

      //--- Bull break: price closes above Resistance zone
      if(g_zones[i].ztype == ZONE_RESISTANCE)
      {
         if(closeNow > g_zones[i].top && closePrev <= g_zones[i].top && !bullBreak)
         {
            g_zones[i].broken       = true;
            g_zones[i].brokenBar    = iBars(_Symbol, PERIOD_M15);
            g_lastBreakZoneTop      = g_zones[i].top;
            g_lastBreakZoneBot      = g_zones[i].bot;
            g_lastBreakScore        = g_zones[i].score;
            g_lastBreakDir          = 1;
            g_lastBreakBar          = iBars(_Symbol, PERIOD_M15);
            g_lastBreakRetested     = false;
            bullBreak               = true;
         }
      }
      //--- Bear break: price closes below Support zone
      else if(g_zones[i].ztype == ZONE_SUPPORT)
      {
         if(closeNow < g_zones[i].bot && closePrev >= g_zones[i].bot && !bearBreak)
         {
            g_zones[i].broken       = true;
            g_zones[i].brokenBar    = iBars(_Symbol, PERIOD_M15);
            g_lastBreakZoneTop      = g_zones[i].top;
            g_lastBreakZoneBot      = g_zones[i].bot;
            g_lastBreakScore        = g_zones[i].score;
            g_lastBreakDir          = -1;
            g_lastBreakBar          = iBars(_Symbol, PERIOD_M15);
            g_lastBreakRetested     = false;
            bearBreak               = true;
         }
      }
   }
}

//===================================================================
// SECTION 10: RETEST SIGNAL DETECTION
//===================================================================

//--- Detect retests of previously broken zones
void DetectRetests(bool &retestBull, bool &retestBear)
{
   if(g_lastBreakDir == 0) return;

   int  currentBars   = iBars(_Symbol, PERIOD_M15);
   int  barsSinceBreak = currentBars - g_lastBreakBar;
   bool inWindow       = (barsSinceBreak >= InpRetestMinBars &&
                          barsSinceBreak <= InpRetestMaxBars);
   if(!inWindow) return;
   if(g_lastBreakRetested) return;   // mitigation filter

   double low1   = iLow(_Symbol,   PERIOD_M15, 1);
   double high1  = iHigh(_Symbol,  PERIOD_M15, 1);
   double close1 = iClose(_Symbol, PERIOD_M15, 1);
   double atr    = GetATR(1);

   //--- Bull retest: price dips back to broken resistance, bounces up
   if(g_lastBreakDir == 1)
   {
      bool touched = (low1 <= g_lastBreakZoneTop);
      bool bounced = (close1 > g_lastBreakZoneTop) &&
                     ((close1 - low1) >= atr * InpRetestReact);
      if(touched && bounced)
      {
         g_lastBreakRetested = true;
         retestBull = true;
      }
   }
   //--- Bear retest: price rallies back to broken support, drops
   else if(g_lastBreakDir == -1)
   {
      bool touched = (high1 >= g_lastBreakZoneBot);
      bool bounced = (close1 < g_lastBreakZoneBot) &&
                     ((high1 - close1) >= atr * InpRetestReact);
      if(touched && bounced)
      {
         g_lastBreakRetested = true;
         retestBear = true;
      }
   }
}

//===================================================================
// SECTION 11: LOT SIZE CALCULATION
//===================================================================

//--- Calculate lot size based on risk% and SL distance in price
double CalcLotSize(double slDistPrice)
{
   if(slDistPrice <= 0) return InpMinLot;

   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = balance * InpRiskPercent / 100.0;

   double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0 || tickSize <= 0) return InpMinLot;

   double slTicks  = slDistPrice / tickSize;
   double lotRaw   = riskAmount / (slTicks * tickVal);

   //--- Normalize to broker's step
   double lotStep  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double lotMin   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double lot      = MathFloor(lotRaw / lotStep) * lotStep;
   lot = MathMax(lot, lotMin);
   lot = MathMin(lot, InpMaxLot);   // Hard cap 0.10

   g_riskAmount = riskAmount;
   return lot;
}

//===================================================================
// SECTION 12: ORDER EXECUTION
//===================================================================

void ExecuteEntry(ENUM_ORDER_TYPE orderType, double entryPrice, double atr, string signalTag)
{
   if(g_todayTrades >= InpMaxTradesDay) return;
   if(atr <= 0) return;

   bool isBuy = (orderType == ORDER_TYPE_BUY);

   //--- Calculate SL using Zone-Aware method
   double slDist = atr * InpSLMultATR;
   double slPrice;

   if(InpUseZoneSL)
   {
      if(isBuy)
      {
         //--- SL below broken zone bottom (+ 0.2×ATR buffer)
         double zoneSL = g_lastBreakZoneBot - atr * 0.2;
         double atrSL  = entryPrice - slDist;
         slPrice = MathMax(atrSL, zoneSL);   // Use deeper of the two for safety
      }
      else
      {
         double zoneSL = g_lastBreakZoneTop + atr * 0.2;
         double atrSL  = entryPrice + slDist;
         slPrice = MathMin(atrSL, zoneSL);
      }
   }
   else
   {
      slPrice = isBuy ? entryPrice - slDist : entryPrice + slDist;
   }

   slDist = MathAbs(entryPrice - slPrice);

   //--- Spread Math Validation — abort if SL or TP too tight
   double spreadPts = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   double slPts     = slDist / SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double tp1Pts    = slPts * InpTP1R;
   if(slPts < 462 || tp1Pts < 616)
   {
      Print("SKIP: SL(", slPts, "pts) or TP1(", tp1Pts, "pts) below Spread Math minimum");
      return;
   }

   //--- TP levels
   double tp1 = isBuy ? entryPrice + slDist * InpTP1R : entryPrice - slDist * InpTP1R;
   double tp2 = isBuy ? entryPrice + slDist * InpTP2R : entryPrice - slDist * InpTP2R;
   double tp3 = isBuy ? entryPrice + slDist * InpTP3R : entryPrice - slDist * InpTP3R;

   //--- Lot size
   double lot = CalcLotSize(slDist);

   //--- Normalize prices
   int    digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   slPrice = NormalizeDouble(slPrice, digits);
   tp3     = NormalizeDouble(tp3, digits);

   //--- Send order (TP set to TP3 initially; partials handled in ManageOpenTrades)
   string comment = InpEAComment + "_" + signalTag + "_Scr" +
                    IntegerToString((int)g_lastBreakScore);
   bool sent = false;
   if(isBuy)
      sent = g_trade.Buy(lot, _Symbol, 0, slPrice, tp3, comment);
   else
      sent = g_trade.Sell(lot, _Symbol, 0, slPrice, tp3, comment);

   if(!sent || g_trade.ResultRetcode() != TRADE_RETCODE_DONE)
   {
      Print("ORDER FAILED: ", g_trade.ResultRetcodeDescription());
      return;
   }

   //--- Record trade state
   g_ticket1    = g_trade.ResultOrder();
   g_tp1Hit     = false;
   g_tp2Hit     = false;
   g_entryPrice = entryPrice;
   g_slPrice    = slPrice;
   g_tp1Price   = tp1;
   g_tp2Price   = tp2;
   g_tp3Price   = tp3;
   g_tradeDir   = isBuy ? 1 : -1;
   g_todayTrades++;

   Print("ORDER OPEN | ", signalTag, " | Lot:", lot,
         " Entry:", entryPrice, " SL:", slPrice,
         " TP1:", tp1, " TP3:", tp3,
         " SL-pts:", slPts, " Score:", g_lastBreakScore);
}

//===================================================================
// SECTION 13: TRADE MANAGEMENT (TP / BE / TRAILING)
//===================================================================

void ManageOpenTrades()
{
   if(g_tradeDir == 0 || g_ticket1 == 0) return;

   //--- Check if main position still open
   if(!g_pos.SelectByTicket(g_ticket1))
   {
      //--- Position closed (hit SL or TP3)
      double pnl = AccountInfoDouble(ACCOUNT_EQUITY) - AccountInfoDouble(ACCOUNT_BALANCE);
      g_todayPnL += HistoryDealGetDouble(
         HistoryDealGetInteger(0, DEAL_TICKET), DEAL_PROFIT);
      ResetTradeState();
      return;
   }

   double bid     = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask     = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double curPrice= (g_tradeDir == 1) ? bid : ask;
   double atr     = GetATR(1);
   bool   isBuy   = (g_tradeDir == 1);

   //--- TP1: Partial close 50% + move SL to Breakeven
   if(!g_tp1Hit)
   {
      bool tp1Reached = isBuy ? (bid >= g_tp1Price) : (ask <= g_tp1Price);
      if(tp1Reached)
      {
         g_tp1Hit = true;
         //--- Partial close 50% of current volume
         if(InpUsePartialTP)
         {
            double vol  = g_pos.Volume();
            double half = NormalizeDouble(vol * 0.5,
                          (int)MathLog10(1.0 / SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP)));
            if(half >= SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN))
               g_trade.PositionClosePartial(g_ticket1, half);
         }
         //--- Breakeven: move SL to entry
         if(InpUseBreakEven)
         {
            double beSL = NormalizeDouble(g_entryPrice,
                          (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
            g_trade.PositionModify(g_ticket1, beSL, g_tp3Price);
            g_slPrice = beSL;
            Print("BREAKEVEN ACTIVATED | Ticket:", g_ticket1);
         }
      }
   }

   //--- TP2: Log only (position already halved; rest runs to TP3)
   if(g_tp1Hit && !g_tp2Hit)
   {
      bool tp2Reached = isBuy ? (bid >= g_tp2Price) : (ask <= g_tp2Price);
      if(tp2Reached)
      {
         g_tp2Hit = true;
         Print("TP2 REACHED | Ticket:", g_ticket1);
      }
   }

   //--- Trailing stop after TP1 hit
   if(g_tp1Hit && InpUseTrailing && atr > 0 && g_pos.SelectByTicket(g_ticket1))
   {
      double trailDist = atr * InpTrailATRMult;
      double newSL;
      if(isBuy)
      {
         newSL = NormalizeDouble(bid - trailDist,
                 (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
         if(newSL > g_slPrice + SymbolInfoDouble(_Symbol, SYMBOL_POINT))
         {
            g_trade.PositionModify(g_ticket1, newSL, g_tp3Price);
            g_slPrice = newSL;
         }
      }
      else
      {
         newSL = NormalizeDouble(ask + trailDist,
                 (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
         if(newSL < g_slPrice - SymbolInfoDouble(_Symbol, SYMBOL_POINT))
         {
            g_trade.PositionModify(g_ticket1, newSL, g_tp3Price);
            g_slPrice = newSL;
         }
      }
   }

   //--- Basket close: check daily target
   if(InpUseBasketClose) CheckBasketClose();
}

//===================================================================
// SECTION 14: BASKET CLOSE + DAILY LIMITS
//===================================================================

//--- Close all open trades if daily profit target reached
void CheckBasketClose()
{
   if(g_dailyRiskBase <= 0) return;
   double dailyProfit = AccountInfoDouble(ACCOUNT_EQUITY) - g_dailyRiskBase;
   double targetAmt   = g_dailyRiskBase * InpRiskPercent / 100.0 * InpDailyTargetR;

   if(dailyProfit >= targetAmt)
   {
      Print("BASKET CLOSE — Daily target reached. Profit: ", dailyProfit);
      CloseAllPositions();
   }
}

//--- Close ALL EA positions
void CloseAllPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
         g_trade.PositionClose(ticket);
   }
   ResetTradeState();
}

//--- Check if daily loss limit or trade count hit
bool IsDailyLimitHit()
{
   if(g_dailyRiskBase <= 0) return false;
   double dailyPnL  = AccountInfoDouble(ACCOUNT_EQUITY) - g_dailyRiskBase;
   double maxLossAmt= g_dailyRiskBase * InpRiskPercent / 100.0 * InpDailyMaxLossR;

   if(dailyPnL <= -maxLossAmt)
   {
      UpdateDashboard("DAILY LOSS LIMIT");
      return true;
   }
   if(g_todayTrades >= InpMaxTradesDay)
   {
      UpdateDashboard("MAX TRADES HIT");
      return true;
   }
   return false;
}

//--- Reset day counters at new calendar day
void CheckDayReset()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   MqlDateTime dtLast;
   TimeToStruct(g_lastDayReset, dtLast);
   if(dt.day != dtLast.day || dt.mon != dtLast.mon)
   {
      g_todayTrades   = 0;
      g_dailyRiskBase = AccountInfoDouble(ACCOUNT_BALANCE);
      g_todayPnL      = 0;
      g_lastDayReset  = TimeCurrent();
      Print("NEW DAY RESET | Balance:", g_dailyRiskBase);
   }
}

void ResetDailyStats()
{
   g_todayTrades   = 0;
   g_dailyRiskBase = AccountInfoDouble(ACCOUNT_BALANCE);
   g_todayPnL      = 0;
   g_lastDayReset  = TimeCurrent();
}

//--- Clear active trade tracking variables
void ResetTradeState()
{
   g_ticket1    = 0;
   g_ticket2    = 0;
   g_tp1Hit     = false;
   g_tp2Hit     = false;
   g_entryPrice = 0;
   g_slPrice    = 0;
   g_tp1Price   = 0;
   g_tp2Price   = 0;
   g_tp3Price   = 0;
   g_tradeDir   = 0;
   g_riskAmount = 0;
}

//===================================================================
//===================================================================
// SECTION 15: ONTRADE TRANSACTION (Track closed trades for stats)
//===================================================================

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result)
{
   //--- Only care about deal-added events
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   //--- Fetch the deal
   if(!HistoryDealSelect(trans.deal)) return;
   ulong magic = HistoryDealGetInteger(trans.deal, DEAL_MAGIC);
   if(magic != InpMagicNumber) return;

   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
   {
      //--- Accumulate daily P&L from closed deals
      double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) +
                      HistoryDealGetDouble(trans.deal, DEAL_SWAP)   +
                      HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
      g_todayPnL += profit;

      //--- Log result
      Print("DEAL CLOSED | Profit:", profit,
            " DailyPnL:", g_todayPnL,
            " Trades today:", g_todayTrades);
   }
}

//===================================================================
// SECTION 16: DASHBOARD (Comment Panel)
//===================================================================

void UpdateDashboard(string status)
{
   double spread   = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double atr      = GetATR(1);
   double atrPts   = atr / SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   string tradeInfo = "None";
   if(g_tradeDir != 0)
   {
      string dir  = (g_tradeDir == 1) ? "LONG" : "SHORT";
      string be   = g_tp1Hit ? " [BE]" : "";
      string tp1s = g_tp1Hit ? "✓" : "—";
      string tp2s = g_tp2Hit ? "✓" : "—";
      tradeInfo   = dir + be +
                    "  SL:" + DoubleToString(g_slPrice, 2) +
                    "  TP1:" + tp1s + DoubleToString(g_tp1Price, 2) +
                    "  TP2:" + tp2s + DoubleToString(g_tp2Price, 2) +
                    "  TP3:" + DoubleToString(g_tp3Price, 2);
   }

   //--- Count active zones by type
   int bullZones = 0, bearZones = 0;
   for(int i = 0; i < g_zoneCount; i++)
   {
      if(!g_zones[i].broken && g_zones[i].score >= InpMinScore)
      {
         if(g_zones[i].ztype == ZONE_SUPPORT)    bullZones++;
         else                                      bearZones++;
      }
   }

   string dash =
      "╔══════════════════════════════════════╗\n"
      "║    VWSR Zone Breakout EA — v1.00     ║\n"
      "╠══════════════════════════════════════╣\n"
      "║ Symbol  : " + _Symbol + "  TF: M15\n"
      "║ Status  : " + status + "\n"
      "║ Spread  : " + DoubleToString(spread, 0) + " pts  ATR: " +
                       DoubleToString(atrPts, 0) + " pts\n"
      "╠══════════════════════════════════════╣\n"
      "║ Zones   : Support=" + IntegerToString(bullZones) +
                  "  Resist=" + IntegerToString(bearZones) +
                  "  Total=" + IntegerToString(g_zoneCount) + "\n"
      "║ Last Break Dir : " + (g_lastBreakDir == 1 ? "BULL ▲" :
                               g_lastBreakDir == -1 ? "BEAR ▼" : "—") +
                  "  Score: " + DoubleToString(g_lastBreakScore, 0) + "\n"
      "╠══════════════════════════════════════╣\n"
      "║ TRADE   : " + tradeInfo + "\n"
      "╠══════════════════════════════════════╣\n"
      "║ Today Trades : " + IntegerToString(g_todayTrades) + "/" +
                            IntegerToString(InpMaxTradesDay) + "\n"
      "║ Today PnL    : " + DoubleToString(g_todayPnL, 2) + " USD\n"
      "║ Balance      : " + DoubleToString(balance, 2) + "\n"
      "║ Equity       : " + DoubleToString(equity, 2) + "\n"
      "║ Risk/Trade   : " + DoubleToString(InpRiskPercent, 1) + "%\n"
      "╚══════════════════════════════════════╝";

   Comment(dash);
}

//===================================================================
// EOF — VWSR Zone Breakout EA v1.00
