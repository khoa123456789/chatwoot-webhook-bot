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

// 🔌 Kết nối MySQL XAMPP (cài mysql2 trước: `npm install mysql2`)
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",         // nếu có mật khẩu thì thêm vào đây
  database: "datn",  // thay tên database của bạn
});

// 🚀 Kết nối Dialogflow
const dialogflowClient = new SessionsClient();

// 📬 Webhook nhận tin nhắn từ Chatwoot
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Trả về ngay tránh retry

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
    let reply = result.fulfillmentText;
    const intentName = result.intent.displayName;
    const parameters = result.parameters.fields;

    // ✅ Xử lý Intent hỏi tour theo khu vực
    if (intentName === "ListTourByRegionIntent" && parameters.region) {
      const region = parameters.region.stringValue.toLowerCase();
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

    // Gửi lại tin nhắn về Chatwoot
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
    console.error("❌ Lỗi webhook xử lý:", err.message);
  }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot đang chạy tại http://localhost:${PORT}`);
});
