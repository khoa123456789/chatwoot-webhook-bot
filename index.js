const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const { SessionsClient } = require("@google-cloud/dialogflow");

const app = express();
app.use(bodyParser.json());

// ========== 🔐 GIẢI MÃ GOOGLE SERVICE ACCOUNT TỪ BASE64 ==========
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
  const keyJson = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, "base64").toString("utf8");
  fs.writeFileSync("/tmp/key.json", keyJson);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/key.json";
  console.log("📄 Đã ghi key.json vào /tmp/key.json");
  console.log("🔑 Key preview:", keyJson.slice(0, 100));
}

// ========== 🧠 THÔNG TIN CHATWOOT VÀ DIALOGFLOW ==========
const CHATWOOT_API_TOKEN = "4k9xJUAh1UG7AK6ofLH3vWsV";
const CHATWOOT_ACCOUNT_ID = "125824";
const DIALOGFLOW_PROJECT_ID = "chatbot-ai-462513";

// ========== 🚀 KẾT NỐI DIALOGFLOW ==========
const dialogflowClient = new SessionsClient();

// ========== 📬 NHẬN WEBHOOK TỪ CHATWOOT ==========
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // ✅ Trả về ngay để tránh Chatwoot retry

  (async () => {
    try {
      const { content, sender, conversation, message_type } = req.body;

      // 🚫 Bỏ qua nếu không phải tin nhắn incoming
      if (message_type !== "incoming") {
        console.log(`⏭️ Bỏ qua message_type = ${message_type}`);
        return;
      }

      console.log("👉 Nhận tin nhắn từ Chatwoot:", content);

      const sessionId = sender.id.toString();
      const sessionPath = dialogflowClient.projectAgentSessionPath(DIALOGFLOW_PROJECT_ID, sessionId);

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
      const reply = responses[0].queryResult.fulfillmentText;

      console.log("🤖 Trả lời từ Dialogflow:", reply);

      // 📤 Gửi lại câu trả lời về Chatwoot
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
      console.error("❌ Lỗi xử lý webhook:", err.message);
    }
  })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot đang chạy tại http://localhost:${PORT}`);
});
