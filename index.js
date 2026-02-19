import axios from "axios";

const ADDRESS   = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

const POLL_URL = `https://data-api.polymarket.com/trades`;
const POLL_INTERVAL_MS = 10000;  // 10秒轮询一次，可调大到 15000-30000 避免 rate limit
const LIMIT = 20;  // 每次拉取最近 20 条，够覆盖间隔内的新交易

let lastProcessedTimestamp = 0;  // 记录最后处理的 trade timestamp，防止重复

async function sendTG(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"           // 支持 <b> 标签
    });
    console.log("TG 推送成功:", text.slice(0, 100));
  } catch (err) {
    console.error("Telegram 发送失败:", err.response?.data || err.message);
  }
}

async function pollTrades() {
  try {
    // 示例：查询 maker 或 taker 是你的地址的最新 trades
    const params = {
      user: ADDRESS,
      limit: LIMIT,
      // takerOnly: false,  // 默认 false，包含 maker 和 taker
    };

    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    if (!Array.isArray(trades)) {
      console.warn("Trades 数据不是数组:", trades);
      return;
    }

    console.log(`拉取到 ${trades.length} 条 trades`);

    for (const trade of trades.reverse()) {  // 从旧到新处理，避免重复
      const timestamp = Number(trade.timestamp || 0);  // timestamp 可能是 unix ms 或 s，根据实际调整

      if (timestamp <= lastProcessedTimestamp) continue;  // 已处理过

      const shares = Number(trade.size || trade.amount || 0);
      const side = (trade.side || "").toUpperCase();  // BUY / SELL

      if (shares >= 1000) {
        const price = trade.price ?? "—";
        const market = trade.conditionId ?? trade.title ?? trade.slug ?? "未知";
        const outcome = trade.outcome ?? "—";

        let alertType = "";
        if (side === "BUY") {
          alertType = "大额买入";
        } else if (side === "SELL") {
          alertType = "大额卖出";
        } else {
          continue;  // 未知 side，跳过
        }

        const text = `🚨 <b>Polymarket ${alertType} (你的地址)</b>\n\n` +
                     `Shares: ${shares}\n` +
                     `Price: ${price} USDC\n` +
                     `Outcome: ${outcome}\n` +
                     `Market: ${market}\n` +
                     `Time: ${new Date(timestamp).toLocaleString() || "—"}`;

        await sendTG(text);
      }

      // 更新最后处理时间
      if (timestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = timestamp;
      }
    }
  } catch (err) {
    console.error("轮询失败:", err.message, err.response?.data || "");
  }
}

// 启动轮询
console.log(`启动轮询监控地址: ${ADDRESS}`);
setInterval(pollTrades, POLL_INTERVAL_MS);
pollTrades();  // 立即执行一次

// 可选：处理进程退出时清理（Railway 不太需要）
process.on("SIGTERM", () => {
  console.log("进程终止");
  process.exit(0);
});
