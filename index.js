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
      limit: 200,          // 拉更多，防止爆单漏
      takerOnly: false,    // ← 关键！包含 Maker（你的卖出）和 Taker
    };

    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    console.log(`拉取到 ${trades.length} 条 trades (takerOnly=false)`);

    // 调试用：打印第一笔（最新）的 proxyWallet 和时间
    if (trades.length > 0) {
      const first = trades[0];
      console.log(`最新 trade proxyWallet: ${first.proxyWallet || '无'}`);
      console.log(`最新 trade 时间: ${new Date(first.timestamp).toLocaleString()} side=${first.side} size=${first.size}`);
    }

    let hasNew = false;
    let newMaxTimestamp = lastProcessedTimestamp;

    for (const trade of trades) {
      let timestamp = Number(trade.timestamp || 0);
      if (timestamp < 1e12) timestamp *= 1000;  // 确保是毫秒

      const shares = Number(trade.size || 0);
      const side = (trade.side || "").toUpperCase();
      const price = trade.price ?? "—";

      console.log(`检查 trade: ts=${timestamp} (${new Date(timestamp).toLocaleString()}), side=${side}, shares=${shares}`);

      if (timestamp <= lastProcessedTimestamp || timestamp === 0) {
        console.log(`跳过: ts <= lastProcessedTimestamp 或无效`);
        continue;
      }

      const tradeKey = `${timestamp}-${side}-${shares}-${price}`;
      if (processedTradeKeys.has(tradeKey)) continue;

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const alertType = side === "BUY" ? "🚨 大额买入" : "🚨 大额卖出";
        const text = `${alertType}\nShares: ${shares}\nPrice: ${price} USDC\nTime: ${new Date(timestamp).toLocaleString()}`;
        await sendTG(text);

        processedTradeKeys.add(tradeKey);
        console.log(`✅ 推送并记录 key: ${tradeKey}`);
        hasNew = true;
      }

      if (timestamp > newMaxTimestamp) newMaxTimestamp = timestamp;
    }

    if (newMaxTimestamp > lastProcessedTimestamp) {
      lastProcessedTimestamp = newMaxTimestamp;
      console.log(`更新 lastProcessedTimestamp → ${newMaxTimestamp}`);
    }

    if (!hasNew) console.log("本轮无新大额交易");
  } catch (err) {
    console.error("轮询失败:", err.message);
  }
}

// 启动
console.log("✅ pm-monitor 监控启动成功 | 只推最新交易 + 北京时间 + 市场标题");
pollTrades();
setInterval(pollTrades, POLL_INTERVAL_MS);

process.on("SIGTERM", () => process.exit(0));
