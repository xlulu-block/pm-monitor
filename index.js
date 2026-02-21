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
    const params = {
      user: ADDRESS,
      limit: 100,   // ← 改大一点，防止爆单时漏
    };

    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    console.log(`拉取到 ${trades.length} 条 trades`);

    let hasNew = false;
    let newMaxTimestamp = lastProcessedTimestamp;   // ← 新增：收集本轮最大时间戳

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
        console.log(`跳过: ts <= lastProcessedTimestamp 或无效`);
        continue;
      }

      const tradeKey = `${timestamp}-${side}-${shares}-${price}`;
      if (processedTradeKeys.has(tradeKey)) {
        console.log(`跳过已处理 key`);
        continue;
      }

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const alertType = side === "BUY" ? "大额买入" : "大额卖出";
        const text = `🚨 ${alertType}\nShares: ${shares}\nPrice: ${price} USDC\nTime: ${new Date(timestamp).toLocaleString()}`;
        await sendTG(text);

        processedTradeKeys.add(tradeKey);
        console.log(`✅ 推送并记录 key: ${tradeKey}`);
        hasNew = true;
      }

      // ←←←← 改这里：只记录最大时间戳，不立即更新
      if (timestamp > newMaxTimestamp) {
        newMaxTimestamp = timestamp;
      }
    }

    // ←←←←← 循环结束后一次性更新
    if (newMaxTimestamp > lastProcessedTimestamp) {
      lastProcessedTimestamp = newMaxTimestamp;
      console.log(`更新 lastProcessedTimestamp → ${newMaxTimestamp}`);
    }

    if (!hasNew && trades.length > 0) {
      console.log("无新大额交易（所有已跳过或历史）");
    }
  } catch (err) {
    console.error("轮询失败:", err.message);
  }
}

// 启动
console.log("✅ pm-monitor 监控启动成功 | 只推最新交易 + 北京时间 + 市场标题");
pollTrades();
setInterval(pollTrades, POLL_INTERVAL_MS);

process.on("SIGTERM", () => process.exit(0));
