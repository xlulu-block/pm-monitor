import axios from "axios";

const ADDRESS = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 30000;  // 30秒

// 🔥 重启不漏单 + 不狂推老消息（包含最近24小时）
let lastProcessedTimestamp = Date.now() - 24 * 60 * 60 * 1000;
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
    const trades = res.data || [];

    console.log(`拉取到 ${trades.length} 条 trades`);

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
        
        // 修复：优先用真实市场标题
        const market = trade.title || trade.slug || "未知市场";
        const outcome = trade.outcome || "—";

        // 修复：强制北京时间
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

      if (timestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = timestamp;
      }
    }
  } catch (err) {
    console.error("轮询失败:", err.message);
  }
}

// 启动
console.log("✅ pm-monitor 监控启动成功 | 北京时间 + 市场标题优化");
pollTrades();
setInterval(pollTrades, POLL_INTERVAL_MS);

process.on("SIGTERM", () => process.exit(0));
