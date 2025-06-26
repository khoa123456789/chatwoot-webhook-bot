const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const { SessionsClient } = require("@google-cloud/dialogflow");

const app = express();
app.use(bodyParser.json());

// ========== 🔐 XỬ LÝ GOOGLE CLOUD SERVICE ACCOUNT KEY ==========
// Render: đọc từ biến môi trường base64, giải mã và ghi file tạm
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
  const keyJson = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, "base64").toString("utf8");
  fs.writeFileSync("/tmp/key.json", keyJson);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/key.json";
  console.log("📄 File key.json đã ghi vào /tmp/key.json");
  console.log("🔑 Key JSON preview:", keyJson.slice(0, 100));
}

// ========== 🧠 KHAI BÁO THÔNG TIN CHATWOOT ==========
// Gán trực tiếp, KHÔNG dùng .env
const CHATWOOT_API_TOKEN = "4k9xJUAh1UG7AK6ofLH3vWsV";  // 🔁 thay bằng token thật
const CHATWOOT_ACCOUNT_ID = "125824";                   // 🔁 thay bằng account ID thật
const DIALOGFLOW_PROJECT_ID = "chatbot-ai-462513";      // 🔁 thay bằng ID dự án của bạn trên GCP

// ========== 🚀 KẾT NỐI DIALOGFLOW ==========
const dialogflowClient = new SessionsClient();

app.post("/webhook", (req, res) => {
  res.sendStatus(200); // 👉 Phản hồi ngay để Chatwoot không gửi lại nhiều lần

  (async () => {
    try {
      const { content, sender, conversation } = req.body;
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
      console.error("❌ Lỗi xử lý webhook (hậu trả lời):", err.message);
    }
  })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot đang chạy tại http://localhost:${PORT}`);
});
