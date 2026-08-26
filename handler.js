import axios from 'axios';
import { formatPriceList, findService } from './prices.js';

const OPENWA_URL = process.env.OPENWA_URL || 'https://openwa-py37.onrender.com';
const API_KEY = process.env.OPENWA_API_KEY;
const SESSION_ID = process.env.OPENWA_SESSION_ID || 'default';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const HANDOFF_KEYWORDS = ['staff', 'agent', 'human', 'operator', 'baat karni', 'baat karo', 'talk to staff', 'talk to human', 'quote', 'exact price', 'custom order'];
const MENU_COMMANDS = ['menu', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];

async function sendText(to, text) {
  try {
    await axios.post(
      `${OPENWA_URL}/api/sessions/${SESSION_ID}/messages/send-text`,
      { chatId: to, text },
      { headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Send text error:', err.message);
  }
}

function isMenuCommand(text) {
  const t = text.trim().toLowerCase();
  return MENU_COMMANDS.includes(t) || /^\d+$/.test(t);
}

function isHandoff(text) {
  const t = text.toLowerCase();
  return HANDOFF_KEYWORDS.some(k => t.includes(k));
}

function isRomanUrdu(text) {
  const urduWords = ['kya', 'hai', 'hoga', 'rate', 'price', 'kitna', 'chahiye', 'chahiye', 'karni', 'karo', 'mujhe', 'chahiye', 'ka', 'ke', 'ki', 'ko', 'se', 'mein', 'par', 'aur', 'ya', 'nahi', 'haan', 'ok', 'theek', 'done', 'confirm', 'order', 'quantity', 'qty', 'size', 'deadline', 'design', 'ready', 'bulk', 'discount', 'special', 'offer'];
  const t = text.toLowerCase();
  return urduWords.some(w => t.includes(w));
}

function buildPrompt(prices, userMessage, isUrdu) {
  const priceList = formatPriceList(prices);
  const lang = isUrdu ? 'Roman Urdu' : 'English';

  return `You are the WhatsApp assistant for a printing shop.
Reply in ${lang} (the customer's language).
Keep answers short (2-6 lines).
Use ONLY the provided price list.
If quantity/discount is unclear, give a range and say staff will confirm.
For apparel/mugs/bulk, ask: quantity, size, deadline, design ready or not.
Never claim official WhatsApp Business API status.

${priceList}

Customer: "${userMessage}"

Reply:`;
}

async function callGroq(prompt) {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 300
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('Groq error:', err.message);
    return null;
  }
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return res.data.candidates[0].content.parts[0].text.trim();
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}

async function getAIReply(prices, userMessage) {
  const isUrdu = isRomanUrdu(userMessage);
  const prompt = buildPrompt(prices, userMessage, isUrdu);

  let reply = await callGroq(prompt);
  if (!reply) reply = await callGemini(prompt);
  if (!reply) reply = 'Sorry, AI service unavailable. Please type "menu" or contact staff.';

  return reply;
}

async function notifyStaff(customerId, userMessage) {
  const staffNumber = process.env.STAFF_NUMBER;
  if (!staffNumber) return;

  const text = `🔔 Handoff Request\nFrom: ${customerId}\nMessage: ${userMessage}\n\nReply to this chat to respond.`;
  await sendText(staffNumber, text);
}

export async function handleWebhook(payload, prices) {
  try {
    const { type, data } = payload;

    if (type !== 'message.received') return;

    const { from, body, fromMe, isGroupMsg } = data;

    if (fromMe || isGroupMsg) return;

    const text = (body || '').trim();
    if (!text) return;

    if (isMenuCommand(text)) return;

    if (isHandoff(text)) {
      await sendText(from, 'A team member will reply shortly.\n\nPlease share:\n1) What you need\n2) Quantity\n3) Size/material\n4) Design ready or need help\n5) Deadline');
      await notifyStaff(from, text);
      return;
    }

    const reply = await getAIReply(prices, text);
    await sendText(from, reply);
  } catch (err) {
    console.error('Handler error:', err);
  }
}