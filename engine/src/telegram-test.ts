import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually — no NestJS context needed for a one-shot test
function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env absent — rely on shell env
  }
}

async function main() {
  loadEnv();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('❌  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in engine/.env');
    console.error('    Add them and run again: npm run telegram:test');
    process.exit(1);
  }

  console.log(`Sending test message to chat ${chatId} …`);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: '✅ <b>Arb Engine</b> — Telegram alerts are working!\n\nYou will receive a message like this whenever a surebet is detected.',
      parse_mode: 'HTML',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok) {
    console.log('✅  Test message delivered. Check your Telegram.');
  } else {
    const body = await res.text();
    console.error(`❌  Telegram API error: HTTP ${res.status}`);
    console.error(body);
    process.exit(1);
  }
}

void main();
