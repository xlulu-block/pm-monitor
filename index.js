import WebSocket from "ws";
import axios from "axios";

const ADDRESS = (process.env.ADDRESS || "").toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/websocket";

function sendTG(text) {
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text
  });
}

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("WS connected");

    ws.send(JSON.stringify({
      topic: `user:${ADDRESS}`,
      event: "phx_join",
      payload: {},
      ref: "1"
    }));
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "fill") {
      const fill = data.payload;
      const shares = Number(fill.size);

      if (shares >= 1000 && fill.side === "buy") {
        await sendTG(`🚨 Large BUY ${shares}`);
      }
    }
  });

  ws.on("close", () => {
    console.log("reconnect");
    setTimeout(connect, 3000);
  });

  ws.on("error", () => ws.close());
}

connect();
      if (data.type === "fill") {
        const shares = Number(data.size);

        if (shares >= 1000 && data.side === "buy") {
          const text =
`🚨 <b>Polymarket 大额买入</b>

Shares: ${shares}
Price: ${data.price}
Market: ${data.market}
`;

          await sendTG(text);
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log("reconnect");
    setTimeout(connect, 3000);
  });

  ws.on("error", () => ws.close());
}

connect();
