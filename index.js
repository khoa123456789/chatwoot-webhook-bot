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
}

// ========== 🧠 KHAI BÁO THÔNG TIN CHATWOOT ==========
// Gán trực tiếp, KHÔNG dùng .env
const CHATWOOT_API_TOKEN = "4k9xJUAh1UG7AK6ofLH3vWsV";  // 🔁 thay bằng token thật
const CHATWOOT_ACCOUNT_ID = "125824";                   // 🔁 thay bằng account ID thật
const DIALOGFLOW_PROJECT_ID = "chatbot-ai-462513";      // 🔁 thay bằng ID dự án của bạn trên GCP

// ========== 🚀 KẾT NỐI DIALOGFLOW ==========
const dialogflowClient = new SessionsClient();

app.post("/webhook", async (req, res) => {
  try {
    const { content, sender, conversation } = req.body;

    console.log("👉 Nhận tin nhắn từ Chatwoot:", content);

    const sessionId = sender.id.toString(); // dùng ID người gửi làm session ID
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

    // Gửi trả lời lại cho Chatwoot
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

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Lỗi xử lý webhook:", err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot đang chạy tại http://localhost:${PORT}`);
});
