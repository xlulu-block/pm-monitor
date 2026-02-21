import axios from "axios";

const ADDRESS   = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 30000;  // 30秒
const LIMIT = 20;

// 🔥 关键修复：重启后自动包含过去7天交易，不会再漏单
let lastProcessedTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;  
const processedTradeKeys = new Set();

async function sendTG(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"
    });
    console.log("TG 推送成功:", text.slice(0, 100));
  } catch (err) {
    console.error("Telegram 发送失败:", err.response?.data || err.message);
  }
}

async function pollTrades() {
  try {
    const params = { user: ADDRESS, limit: LIMIT };
    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    console.log(`拉取到 ${trades.length} 条 trades`);

    let hasNew = false;

    for (const trade of trades) {
      let timestampRaw = trade.timestamp || trade.createdAt || 0;
      let timestamp = Number(timestampRaw);
      if (isNaN(timestamp)) timestamp = 0;
      if (timestamp < 1e12) timestamp *= 1000;

      const shares = Number(trade.size || trade.amount || 0);
      const side = (trade.side || "").toUpperCase();
      const price = trade.price ?? trade.avgPrice ?? "—";

      console.log(`检查 trade: ts=${timestamp} (${new Date(timestamp).toLocaleString()}), side=${side}, shares=${shares}`);

      if (timestamp <= lastProcessedTimestamp || timestamp === 0) {
        console.log(`跳过: ts <= lastProcessedTimestamp`);
        continue;
      }

      const tradeKey = `${timestamp}-${side}-${shares}-${price}`;
      if (processedTradeKeys.has(tradeKey)) continue;

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const alertType = side === "BUY" ? "🚀 大额买入" : "🔴 大额卖出";
        const market = trade.title || trade.slug || trade.conditionId || "未知市场";
        const outcome = trade.outcome || "—";

        const text = `${alertType}\n\n` +
                     `Shares: ${shares.toLocaleString()}\n` +
                     `Price: ${price} USDC\n` +
                     `Outcome: ${outcome}\n` +
                     `Market: ${market}\n` +
                     `Time: ${new Date(timestamp).toLocaleString()}`;

        await sendTG(text);

        processedTradeKeys.add(tradeKey);
        console.log(`✅ 推送成功并记录: ${alertType} ${shares} shares`);
        hasNew = true;
      }

      if (timestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = timestamp;
        console.log(`更新 lastProcessedTimestamp → ${new Date(timestamp).toLocaleString()}`);
      }
    }

    if (!hasNew && trades.length > 0) {
      console.log("无新大额交易（所有已跳过或历史）");
    }
  } catch (err) {
    console.error("轮询失败:", err.message);
  }
}

// 启动
console.log(`✅ 监控启动 - 地址: ${ADDRESS} | 间隔: 30s | 包含最近7天交易`);
setInterval(pollTrades, POLL_INTERVAL_MS);
pollTrades();   // 立即执行一次

process.on("SIGTERM", () => process.exit(0));
