import axios from "axios";

const ADDRESS   = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 30000;  // 30秒
const LIMIT = 20;

let lastProcessedTimestamp = Date.now();  // 只监控启动后的新交易
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
    const params = {
      user: ADDRESS,
      limit: LIMIT,
    };

    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    if (!Array.isArray(trades)) {
      console.warn("Trades 不是数组:", trades);
      return;
    }

    console.log(`拉取到 ${trades.length} 条 trades`);

    let hasNew = false;

    for (const trade of trades) {
      // timestamp 处理：假设秒或 ms，兼容字符串
      let timestampRaw = trade.timestamp || trade.createdAt || 0;
      let timestamp = Number(timestampRaw);
      if (isNaN(timestamp)) timestamp = 0;
      if (timestamp < 1e12) timestamp *= 1000;  // 秒转 ms

      const shares = Number(trade.size || trade.amount || 0);
      const side = (trade.side || "").toUpperCase();
      const price = trade.price ?? trade.avgPrice ?? "—";

      // 日志：详细打印
      console.log(`检查 trade: ts=${timestamp} (${new Date(timestamp).toLocaleString() || '无效'}), side=${side}, shares=${shares}, price=${price}, conditionId=${trade.conditionId || '无'}`);

      if (timestamp <= lastProcessedTimestamp || timestamp === 0) {
        console.log(`跳过: ts <= lastProcessedTimestamp 或无效`);
        continue;
      }

      // 防重 key
      const tradeKey = `${timestamp}-${side}-${shares}-${price}`;
      if (processedTradeKeys.has(tradeKey)) {
        console.log(`跳过已处理 key: ${tradeKey}`);
        continue;
      }

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const alertType = side === "BUY" ? "大额买入" : "大额卖出";
        const market = trade.conditionId || trade.title || trade.slug || "未知";
        const outcome = trade.outcome || "—";

        const text = `🚨 <b>Polymarket ${alertType} (你的地址)</b>\n\n` +
                     `Shares: ${shares}\n` +
                     `Price: ${price} USDC\n` +
                     `Outcome: ${outcome}\n` +
                     `Market: ${market}\n` +
                     `Time: ${new Date(timestamp).toLocaleString() || "—"}`;

        await sendTG(text);

        processedTradeKeys.add(tradeKey);
        console.log(`推送并记录 key: ${tradeKey}`);
        hasNew = true;
      }

      // 更新 ts
      if (timestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = timestamp;
        console.log(`更新 lastProcessedTimestamp → ${timestamp}`);
      }
    }

    if (!hasNew && trades.length > 0) {
      console.log("无新大额交易（所有已跳过或历史）");
    }
  } catch (err) {
    console.error("轮询失败:", err.message);
    if (err.response) console.error("状态:", err.response.status, "数据:", JSON.stringify(err.response.data || {}));
  }
}

// 启动
console.log(`监控启动 - 地址: ${ADDRESS} | 间隔: ${POLL_INTERVAL_MS/1000}s | 只新交易`);
setInterval(pollTrades, POLL_INTERVAL_MS);
pollTrades();

process.on("SIGTERM", () => {
  console.log("进程终止");
  process.exit(0);
});
