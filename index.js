import WebSocket from "ws";
import axios from "axios";

const ADDRESS   = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user";

async function sendTG(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML"           // 支持 <b> 标签
    });
  } catch (err) {
    console.error("Telegram 发送失败", err.response?.data || err.message);
  }
}

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("WS 已连接 (market channel，无需密钥)");

    // 订阅全市场更新（[] = 所有市场；可改成具体 token_ids 数组来减少数据量）
    const subscribeMsg = {
      assets_ids: [],               // 空 = 全市场 trades/fills
      type: "market",
      custom_feature_enabled: true  // 启用更多事件，包括 trade/fill 相关
    };

    ws.send(JSON.stringify(subscribeMsg));
    console.log("已发送订阅:", JSON.stringify(subscribeMsg));
  });

  ws.on("message", async (msg) => {
    try {
      const raw = msg.toString();
      const data = JSON.parse(raw);
      
      // 调试用：先打印所有消息结构（上线后可注释掉，避免日志爆炸）
      // console.log("收到消息:", JSON.stringify(data, null, 2));

      // Polymarket market channel 的 fill/trade 常见结构
      // 可能在 data.event_type === "trade" 或 "fill"，或直接在 payload 里
      if (data.event_type === "trade" || data.event === "fill" || data.type === "fill" || data.payload?.event === "fill") {
        const fill = data.payload || data;  // 兼容不同嵌套

        const maker = (fill.maker || fill.maker_address || "").toLowerCase();
        const taker = (fill.taker || fill.taker_address || "").toLowerCase();
        const side = (fill.side || fill.order_side || "").toLowerCase();
        const shares = Number(fill.size || fill.amount || fill.quantity || fill.shares || 0);

        // 只处理你的地址参与的买入，且 >=1000 shares
        if ((maker === ADDRESS || taker === ADDRESS) &&
            shares >= 1000 &&
            side === "buy") {

          const text = `🚨 <b>你的地址大额买入</b>\n\n` +
                       `Shares: ${shares}\n` +
                       `Price: ${fill.price ?? fill.avg_price ?? fill.last_price ?? "—"} USDC\n` +
                       `Market: ${fill.market ?? fill.condition_id ?? fill.token_id ?? "未知"}\n` +
                       `Maker: ${maker.slice(0,6)}...${maker.slice(-4)}\n` +
                       `Taker: ${taker.slice(0,6)}...${taker.slice(-4)}`;

          await sendTG(text);
          console.log("已推送大额买入:", shares);
        }
      }
    } catch (err) {
      console.error("消息解析失败:", err.message, msg.toString().slice(0, 200));  // 截断避免日志过长
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`WS 断开 - code: ${code || "未知"}, reason: ${reason || "无"} → 3秒后重连`);
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket 错误:", err.message);
    ws.close();
  });
}
// 启动
connect();
