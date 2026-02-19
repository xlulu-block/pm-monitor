import axios from "axios";

const ADDRESS   = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 30000;  // 先调到 30秒测试，避免太频繁
const LIMIT = 20;

let lastProcessedTimestamp = Date.now() - 5 * 60 * 1000;  // 启动时设为 5 分钟前，只看最近的
const processedTradeKeys = new Set();  // 用 timestamp + size + side 作为 key 防重（或用 id 如果有）

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
      console.warn("Trades 数据不是数组:", trades);
      return;
    }

    console.log(`拉取到 ${trades.length} 条 trades (最新在前)`);

    // 假设 trades 已按时间降序（最新先），我们从头（最新）到尾处理
    for (const trade of trades) {
      const timestamp = Number(trade.timestamp || trade.createdAt || 0) * 1000;  // 假设秒转 ms，如果已经是 ms 则不变
      const shares = Number(trade.size || trade.amount || 0);
      const side = (trade.side || "").toUpperCase();

      // 调试日志：每条 trade 都打印关键信息
      console.log(`检查 trade: ts=${timestamp}, side=${side}, shares=${shares}, price=${trade.price ?? '—'}`);

      if (timestamp <= lastProcessedTimestamp) continue;

      // 额外防重 key（防止相同 ts 的多条）
      const tradeKey = `${timestamp}-${shares}-${side}`;
      if (processedTradeKeys.has(tradeKey)) {
        console.log(`跳过已处理 key: ${tradeKey}`);
        continue;
      }

      if (shares >= 1000) {
        let alertType = "";
        if (side === "BUY") {
          alertType = "大额买入";
        } else if (side === "SELL") {
          alertType = "大额卖出";
        } else {
          console.log(`未知 side: ${side}, 跳过`);
          continue;
        }

        const price = trade.price ?? "—";
        const market = trade.conditionId ?? trade.title ?? trade.slug ?? "未知";
        const outcome = trade.outcome ?? "—";

        const text = `🚨 <b>Polymarket ${alertType} (你的地址)</b>\n\n` +
                     `Shares: ${shares}\n` +
                     `Price: ${price} USDC\n` +
                     `Outcome: ${outcome}\n` +
                     `Market: ${market}\n` +
                     `Time: ${new Date(timestamp).toLocaleString() || "—"}`;

        await sendTG(text);

        // 标记已处理
        processedTradeKeys.add(tradeKey);
      }

      // 更新最后时间（即使没推送，也更新，避免卡住）
      if (timestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = timestamp;
      }
    }
  } catch (err) {
    console.error("轮询失败:", err.message, err.response?.data || err.response?.status);
  }
}

// 启动
console.log(`启动轮询监控地址: ${ADDRESS} (间隔 ${POLL_INTERVAL_MS/1000}s)`);
setInterval(pollTrades, POLL_INTERVAL_MS);
pollTrades();  // 立即一次

process.on("SIGTERM", () => {
  console.log("进程终止");
  process.exit(0);
});
