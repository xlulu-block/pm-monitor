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
    console.log("WS 已连接");
    ws.send(JSON.stringify({
      topic: `user:${ADDRESS}`,
      event: "phx_join",
      payload: {},
      ref: "1"
    }));
  });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // 目前最常见的两种 payload 结构（任选其一，或都兼容）
      if (data.event === "fill") {
        // 老格式 / 部分市场格式
        const fill = data.payload || data;
        const shares = Number(fill.size ?? fill.amount ?? 0);

        if (shares >= 1000 && fill.side?.toLowerCase() === "buy") {
          const text = `🚨 <b>Polymarket 大额买入</b>\n\n` +
                       `Shares: ${shares}\n` +
                       `Price: ${fill.price ?? "—"} USDC\n` +
                       `Market: ${fill.market ?? fill.condition_id ?? "—"}`;

          await sendTG(text);
        }
      }

      // 如果将来变成了 data.type 格式（备用）
      else if (data.type === "fill") {
        const shares = Number(data.size ?? 0);
        if (shares >= 1000 && data.side?.toLowerCase() === "buy") {
          const text = `🚨 <b>Polymarket 大额买入</b>\n\n` +
                       `Shares: ${shares}\n` +
                       `Price: ${data.price ?? "—"} USDC\n` +
                       `Market: ${data.market ?? "—"}`;

          await sendTG(text);
        }
      }
    } catch (err) {
      console.error("解析 WS 消息失败:", err.message, msg.toString());
    }
  });

  ws.on("close", () => {
    console.log("WS 断开 → 3秒后重连");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket 错误:", err.message);
    ws.close();
  });
}

// 启动
connect();
