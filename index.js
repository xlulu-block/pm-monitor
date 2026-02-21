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
      user: ADDRESS,        // ← 保持你配置文件里的地址，不用改
      limit: 200,
      takerOnly: false,     // ← 必须！因为你全是限价单（Maker）
    };

    const res = await axios.get(POLL_URL, { params });
    const trades = res.data || [];

    console.log(`✅ 拉取到 ${trades.length} 条 trades (takerOnly=false)`);

    // 调试：打印最新一笔（让你一眼看到是否拉到 2/21 的单）
    if (trades.length > 0) {
      const latest = trades[0];
      console.log(`最新交易: ${latest.side} ${Number(latest.size).toFixed(2)} shares | 时间: ${new Date(latest.timestamp * 1000).toLocaleString('zh-CN')} | 市场: ${latest.title}`);
    }

    let hasNew = false;
    let newMaxTimestamp = lastProcessedTimestamp;

    for (const trade of trades) {
      let timestamp = Number(trade.timestamp || 0);
      if (timestamp < 10000000000) timestamp *= 1000;   // 秒 → 毫秒（关键修复）

      const shares = Number(trade.size || 0);
      const side = (trade.side || "").toUpperCase();
      const price = trade.price ?? "—";
      const market = (trade.title || "未知市场").slice(0, 80);

      console.log(`检查: ${new Date(timestamp).toLocaleString('zh-CN')} | ${side} | ${shares.toFixed(2)} shares | ${market}`);

      if (timestamp <= lastProcessedTimestamp || timestamp === 0) continue;

      const tradeKey = `${timestamp}-${side}-${shares.toFixed(2)}`;
      if (processedTradeKeys.has(tradeKey)) continue;

      if (shares >= 1000 && (side === "BUY" || side === "SELL")) {
        const emoji = side === "BUY" ? "📈" : "📉";
        const alertType = side === "BUY" ? "大额买入" : "大额卖出";
        const text = `${emoji} ${alertType}\n市场: ${market}\n数量: ${shares.toFixed(2)} shares\n价格: ${price} USDC\n时间: ${new Date(timestamp).toLocaleString('zh-CN')}`;

        await sendTG(text);
        processedTradeKeys.add(tradeKey);
        console.log(`✅ 已推送: ${shares} ${side} ${market}`);
        hasNew = true;
      }

      if (timestamp > newMaxTimestamp) newMaxTimestamp = timestamp;
    }

    if (newMaxTimestamp > lastProcessedTimestamp) {
      lastProcessedTimestamp = newMaxTimestamp;
      console.log(`更新 lastProcessedTimestamp`);
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
