/**
 * SMS OTP delivery service.
 *
 * Priority order:
 *  1. Twilio      (global – set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)
 *  2. Fast2SMS    (India – set FAST2SMS_API_KEY)
 *  3. 2Factor.in  (India – set TWOFACTOR_API_KEY)
 *  4. Console     (development fallback – logs OTP to server terminal only)
 */

const axios = require("axios");

function has2FactorConfig() {
  return Boolean(process.env.TWOFACTOR_API_KEY);
}

function hasFast2SmsConfig() {
  return Boolean(process.env.FAST2SMS_API_KEY);
}

function hasTwilioConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/**
 * Send OTP via Fast2SMS Quick SMS route (q route — no DLT, works on all Indian numbers including DND)
 * Uses international gateway. Cost: ₹5 per SMS. No prior verification needed.
 */
async function sendViaFast2SmsQuick(toPhone, otp, ttlMinutes) {
  const digits = String(toPhone).replace(/\D/g, "");
  const number = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;

  const message = `Your Parent Portal OTP is: ${otp}. Valid for ${ttlMinutes} minutes. Do not share this with anyone.`;

  console.log(`[Fast2SMS Quick] Sending OTP to: ${number}`);

  let response;
  try {
    response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        route: "q",
        message: message,
        numbers: number,
        flash: 0
      }
    });
  } catch (err) {
    const errBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`[Fast2SMS Quick] Failed: ${errBody}`);
    return null;
  }

  console.log(`[Fast2SMS Quick] Response:`, JSON.stringify(response.data));

  if (!response.data?.return) {
    console.warn(`[Fast2SMS Quick] Not successful: ${JSON.stringify(response.data)}`);
    return null;
  }

  console.log(`[Fast2SMS Quick] OTP sent successfully to ${number}`);
  return { provider: "fast2sms-quick" };
}

/**
 * Send OTP via 2Factor.in (India, free trial – https://2factor.in)
 * Free trial gives credits enough for ~50 OTPs.
 */
async function sendVia2Factor(toPhone, otp) {
  const digits = String(toPhone).replace(/\D/g, "");
  const number = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;

  const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/${number}/${otp}/OTP1`;

  console.log(`[2Factor] Sending OTP to: ${number}`);

  let response;
  try {
    response = await axios.get(url);
  } catch (err) {
    const errBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`[2Factor] Error: ${errBody}`);
    throw new Error(`2Factor.in failed: ${errBody}`);
  }

  console.log(`[2Factor] Response:`, JSON.stringify(response.data));

  if (response.data?.Status !== "Success") {
    throw new Error(`2Factor.in error: ${JSON.stringify(response.data)}`);
  }

  console.log(`[2Factor] OTP sent successfully to ${number}`);
  return { provider: "2factor" };
}

/**
 * Send OTP via Fast2SMS Quick SMS route (India – https://www.fast2sms.com)
 * Uses "q" route (Quick SMS) — works with wallet balance, no DLT/verification required.
 * Cost: ₹5 per SMS via international gateway.
 */
async function sendViafFast2Sms(toPhone, otp, ttlMinutes) {
  const digits = String(toPhone).replace(/\D/g, "");
  const number = digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits.length === 13 && digits.startsWith("091")
      ? digits.slice(3)
      : digits;

  const message = `Your Parent Portal OTP is ${otp}. Valid for ${ttlMinutes} minutes. Do not share this with anyone.`;

  console.log(`[Fast2SMS Quick] Sending OTP to number: ${number}`);

  let response;
  try {
    response = await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        route: "q",
        message: message,
        flash: 0,
        numbers: number
      }
    });
  } catch (err) {
    const errBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`[Fast2SMS Quick] HTTP error: ${errBody}`);
    throw new Error(`Fast2SMS failed: ${errBody}`);
  }

  console.log(`[Fast2SMS Quick] Response:`, JSON.stringify(response.data));

  if (!response.data?.return) {
    throw new Error(`Fast2SMS error: ${JSON.stringify(response.data)}`);
  }

  console.log(`[Fast2SMS Quick] OTP sent successfully to ${number}`);
  return { provider: "fast2sms-quick" };
}

/**
 * Send OTP via Twilio SMS (global – https://www.twilio.com)
 */
async function sendViaTwilio(toPhone, otp, ttlMinutes) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = String(process.env.TWILIO_FROM_NUMBER || "").replace(/\s+/g, "");

  const body = `Your OTP is: ${otp}\nValid for ${ttlMinutes} minutes. Do not share this with anyone.`;

  // Normalize to E.164. For local 10-digit Indian numbers, prepend +91.
  const toDigits = String(toPhone).replace(/\D/g, "");
  const to = toDigits.length === 10 ? `+91${toDigits}` : `+${toDigits}`;

  if (!fromNumber.startsWith("+")) {
    throw new Error("Invalid TWILIO_FROM_NUMBER. It must be a Twilio-owned E.164 number like +1415XXXXXXX");
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({ From: fromNumber, To: to, Body: body }).toString(),
      {
        auth: { username: accountSid, password: authToken },
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );
  } catch (err) {
    const twilioData = err.response?.data;
    if (twilioData?.code || twilioData?.message) {
      throw new Error(`Twilio error ${twilioData.code || "unknown"}: ${twilioData.message}`);
    }
    throw new Error(`Twilio request failed: ${err.message}`);
  }

  console.log(`[SMS Twilio -> ${to}] OTP sent`);
  return { provider: "twilio" };
}

/**
 * Send OTP SMS to the given phone number.
 * Returns { provider } on success.
 * Throws on delivery failure.
 */
async function sendOtpSms(toPhone, otp, ttlMinutes) {
  if (hasTwilioConfig()) {
    try {
      return await sendViaTwilio(toPhone, otp, ttlMinutes);
    } catch (twilioErr) {
      console.warn(`[Twilio fallback] ${twilioErr.message}`);
      if (!hasFast2SmsConfig() && !has2FactorConfig()) {
        throw twilioErr;
      }
    }
  }

  if (hasFast2SmsConfig()) {
    return sendViafFast2Sms(toPhone, otp, ttlMinutes);
  }

  if (has2FactorConfig()) {
    return sendVia2Factor(toPhone, otp);
  }

  // Development fallback — OTP visible only in server console
  console.log(`[SMS DEV -> ${toPhone}] OTP: ${otp} (valid ${ttlMinutes} min)`);
  return { provider: "console" };
}

function hasSmsConfig() {
  return has2FactorConfig() || hasFast2SmsConfig() || hasTwilioConfig();
}

module.exports = { sendOtpSms, hasSmsConfig };
