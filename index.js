const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const mysql = require("mysql2/promise");
const { SessionsClient } = require("@google-cloud/dialogflow");

const app = express();
app.use(bodyParser.json());

// 🔐 Giải mã GOOGLE_APPLICATION_CREDENTIALS nếu dùng Render
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
  const keyJson = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, "base64").toString("utf8");
  fs.writeFileSync("/tmp/key.json", keyJson);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/key.json";
  console.log("📄 Đã ghi key.json vào /tmp/key.json");
}

// 🔧 Config
const CHATWOOT_API_TOKEN = "4k9xJUAh1UG7AK6ofLH3vWsV";
const CHATWOOT_ACCOUNT_ID = "125824";
const DIALOGFLOW_PROJECT_ID = "chatbot-ai-462513";

// 🔌 Kết nối MySQL XAMPP
const db = mysql.createPool({
  host: "nozomi.proxy.rlwy.net",
  user: "root",
  password: "BNSCbilgTFWfSdjZbJdlMuBjfAYHNnXz",
  port: 30418,
  database: "railway",
});

// 🚀 Kết nối Dialogflow
const dialogflowClient = new SessionsClient();

// 📬 Webhook nhận tin nhắn từ Chatwoot → gửi lên Dialogflow xử lý
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Gửi 200 để Chatwoot không retry

  try {
    const { content, sender, conversation, message_type } = req.body;
    if (message_type !== "incoming") return;

    console.log("📩 Tin nhắn từ Chatwoot:", content);

    const sessionPath = dialogflowClient.projectAgentSessionPath(DIALOGFLOW_PROJECT_ID, sender.id.toString());

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: content,
          languageCode: "vi",
        },
      },
    };

    const responses = await dialogflowClient.detectIntent(request);
    const result = responses[0].queryResult;
    let reply = result.fulfillmentText || "Xin chào! Tôi có thể giúp gì cho bạn?";
    const intentName = result.intent.displayName;
    const parameters = result.parameters.fields;
    console.log("📦 Parameters nhận được:", JSON.stringify(parameters, null, 2));

    // ✅ Nếu là intent hỏi tour theo khu vực → xử lý riêng
    if (intentName === "ListTourByRegionIntent" && parameters.location) {
      const region = parameters.location.stringValue || "";
      const [locations] = await db.query("SELECT id FROM locations WHERE l_name LIKE ?", [`%${region}%`]);

      if (locations.length === 0) {
        reply = `Hiện tại không có tour nào ở khu vực "${region}".`;
      } else {
        const locationId = locations[0].id;
        const [tours] = await db.query("SELECT t_title, t_price_adults FROM tours WHERE t_location_id = ?", [locationId]);

        if (tours.length === 0) {
          reply = `Chưa có tour nào trong khu vực "${region}".`;
        } else {
          reply = `Các tour ở ${region}:\n` + tours.map(t => `• ${t.t_title} – ${t.t_price_adults.toLocaleString()}đ`).join("\n");
        }
      }
    }

    console.log("🤖 Trả lời:", reply);

    // Gửi trả lời về Chatwoot
    await axios.post(
      `https://app.chatwoot.com/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversation.id}/messages`,
      {
        content: reply,
        message_type: "outgoing",
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
        },
      }
    );
  } catch (err) {
    console.error("❌ Lỗi webhook xử lý:", err);
  }
});

// ✅ Webhook xử lý trực tiếp từ Dialogflow (dùng cho simulator hoặc webhook intent)
app.post("/dialogflow", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const parameters = req.body.queryResult.parameters;
    console.log("📦 Parameters nhận được:", JSON.stringify(parameters, null, 2));
    let reply = "Tôi chưa rõ yêu cầu của bạn.";

    if (intentName === "ListTourByRegionIntent" && parameters.location) {
      const region =
        typeof parameters.location === "string"
          ? parameters.location
          : parameters.location?.stringValue || "";

      const [locations] = await db.query(
        "SELECT id FROM locations WHERE l_name LIKE ?",
        [`%${region}%`]
      );

      if (locations.length === 0) {
        reply = `Hiện tại không có tour nào ở khu vực "${region}".`;
      } else {
        const locationId = locations[0].id;
        const [tours] = await db.query(
          "SELECT t_title, t_price_adults FROM tours WHERE t_location_id = ?",
          [locationId]
        );

        if (tours.length === 0) {
          reply = `Chưa có tour nào trong khu vực "${region}".`;
        } else {
          reply =
            `Các tour ở ${region}:\n` +
            tours
              .map(
                (t) =>
                  `• ${t.t_title} – ${t.t_price_adults.toLocaleString()}đ`
              )
              .join("\n");
        }
      }
    }

    return res.json({
      fulfillmentText: reply,
    });
  } catch (err) {
    console.error("❌ Lỗi xử lý Dialogflow webhook:", err);
    return res.json({
      fulfillmentText: "Xin lỗi, hệ thống đang gặp lỗi khi xử lý yêu cầu.",
    });
  }
});
// 🚀 Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot đang chạy tại http://localhost:${PORT}`);
});
