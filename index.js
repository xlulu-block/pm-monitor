import axios from "axios";

const ADDRESS = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 30000;  // 30秒

// 🔥 只监控启动后的新交易，不补老消息
let lastProcessedTimestamp = Date.now();
const processedTradeKeys = new Set();

async function sendTG(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "HTML"
    });
    console.log("✅ TG 推送成功");
  } catch (err) {
    console.error("❌ Telegram 发送失败:", err.response?.data || err.message);
  }
}

async function pollTrades() {
  try {
    const res = await axios.get(POLL_URL, { params: { user: ADDRESS, limit: 30 } });
    let trades = res.data || [];

    console.log(`拉取到 ${trades.length} 条 trades`);

    // 排序按时间升序（旧到新）
    trades = trades.sort((a, b) => {
      let tsA = Number(a.timestamp || a.createdAt || 0);
      let tsB = Number(b.timestamp || b.createdAt || 0);
      if (tsA < 1e12) tsA *= 1000;
      if (tsB < 1e12) tsB *= 1000;
      return tsA - tsB;
    });

    let maxTimestamp = lastProcessedTimestamp;

    for (const trade of trades) {
      let timestamp = Number(trade.timestamp || trade.createdAt || 0);
      if (timestamp < 1e12) timestamp *= 1000;  // 秒转毫秒

      const shares = Number(trade.size || trade.amount || 0);
      const side = (trade.side || "").toUpperCase();
      const price = Number(trade.price ? (trade.avgPrice || 0) : 0).toFixed(4);

      const tradeKey = `${timestamp}-${side}-${shares}`;

      if (timestamp <= lastProcessedTimestamp || processedTradeKeys.has(tradeKey)) {
        continue;
      }

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const alertType = side === "BUY" ? "🚀 大额买入" : "🔴 大额卖出";
        
        const market = trade.title || trade.slug || "未知市场";
        const outcome = trade.outcome || "—";

        const timeStr = new Date(timestamp).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false
        });

        const text = `${alertType}\n\n` +
                     `Shares: ${shares.toLocaleString()}\n` +
                     `Price: ${price} USDC\n` +
                     `Outcome: ${outcome}\n` +
                     `Market: ${market}\n` +
                     `Time: ${timeStr} (北京时间)`;

        await sendTG(text);

        processedTradeKeys.add(tradeKey);
        console.log(`✅ 推送成功: ${alertType} ${shares} shares - ${market}`);
      }

      if (timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
      }
    }

    // 统一更新到最大 ts
    lastProcessedTimestamp = maxTimestamp;

  } catch (err) {
    console.error("轮询失败:", err.message);
  }
}

// 启动
console.log("✅ pm-monitor 监控启动成功 | 只推最新交易 + 北京时间 + 市场标题");
pollTrades();
setInterval(pollTrades, POLL_INTERVAL_MS);

process.on("SIGTERM", () => process.exit(0));
