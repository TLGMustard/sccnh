/*
 * SCCNH confirmation-mail web app
 *
 * Deploy as a Web app that executes as the Workspace account that should send
 * receipts. Set SCCNH_WEBHOOK_SECRET in Script Properties before deploying.
 */

const SCCNH = Object.freeze({
  secretProperty: 'SCCNH_WEBHOOK_SECRET',
  maxAgeMs: 5 * 60 * 1000,
  replayWindowSeconds: 5 * 60,
  senderName: 'UF Hillel',
  dateLabels: {
    '2027-01-25': 'Mon, Jan 25',
    '2027-01-27': 'Wed, Jan 27',
    '2027-01-28': 'Thu, Jan 28',
  },
});

function doPost(event) {
  try {
    const envelope = JSON.parse(event && event.postData && event.postData.contents || '');
    if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > 12000 || !/^[A-Za-z0-9_-]{43}$/.test(envelope.signature)) return response(false);

    const secret = PropertiesService.getScriptProperties().getProperty(SCCNH.secretProperty);
    if (!secret) return response(false);
    const expected = webSafeBase64(Utilities.computeHmacSha256Signature(envelope.payload, secret));
    if (!constantTimeEqual(expected, envelope.signature)) return response(false);

    const rawPayload = Utilities.newBlob(Utilities.base64DecodeWebSafe(envelope.payload)).getDataAsString('UTF-8');
    const request = validRequest(JSON.parse(rawPayload));
    if (!request) return response(false);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return response(false);
    try {
      const replayKey = `sccnh-confirmation:${envelope.signature}`;
      const cache = CacheService.getScriptCache();
      if (cache.get(replayKey)) return response(false);
      cache.put(replayKey, '1', SCCNH.replayWindowSeconds);
    } finally {
      lock.releaseLock();
    }
    if (MailApp.getRemainingDailyQuota() < 1) return response(false);
    const message = confirmationMessage(request);
    MailApp.sendEmail({
      to: request.receipt.email,
      subject: message.subject,
      body: message.text,
      htmlBody: message.html,
      name: SCCNH.senderName,
    });
    return response(true);
  } catch (_error) {
    // Do not log the webhook body or volunteer contact information.
    console.error('SCCNH confirmation rejected or failed');
    return response(false);
  }
}

function response(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: Boolean(ok) }))
    .setMimeType(ContentService.MimeType.JSON);
}

function webSafeBase64(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function safeText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return text && text.length <= maxLength ? text : null;
}

function validRequest(value) {
  if (!value || value.version !== 1 || !Number.isFinite(value.timestamp) || Math.abs(Date.now() - value.timestamp) > SCCNH.maxAgeMs || !/^[A-Za-z0-9_-]{20,}$/.test(value.nonce || '')) return null;
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value.appOrigin || '')) return null;
  const receipt = value.receipt;
  if (!receipt || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receipt.email || '') || receipt.email.length > 254) return null;
  const firstName = safeText(receipt.firstName, 80);
  if (!firstName || !Array.isArray(receipt.shifts) || receipt.shifts.length < 1 || receipt.shifts.length > 20) return null;
  const shifts = receipt.shifts.map((shift) => validShift(shift));
  if (shifts.some((shift) => !shift)) return null;
  return { appOrigin: value.appOrigin, receipt: { email: receipt.email, firstName, shifts } };
}

function validShift(shift) {
  if (!shift || !Object.prototype.hasOwnProperty.call(SCCNH.dateLabels, shift.date)) return null;
  const startsAt = safeText(shift.startsAt, 32);
  const endsAt = safeText(shift.endsAt, 32);
  const location = safeText(shift.location, 120);
  const role = safeText(shift.role, 80);
  if (!startsAt || !endsAt || !location || !role || !/^2027-01-\d\dT\d\d:\d\d:\d\d-05:00$/.test(startsAt) || !/^2027-01-\d\dT\d\d:\d\d:\d\d-05:00$/.test(endsAt)) return null;
  return { date: shift.date, startsAt, endsAt, location, role };
}

function confirmationMessage(request) {
  const shiftText = request.receipt.shifts.map((shift) => `${SCCNH.dateLabels[shift.date]}\n${timeRange(shift.startsAt, shift.endsAt)}\n${shift.location} · ${shift.role}`).join('\n\n');
  const shiftHtml = request.receipt.shifts.map((shift) => `<li><strong>${escapeHtml(SCCNH.dateLabels[shift.date])}</strong><br>${escapeHtml(timeRange(shift.startsAt, shift.endsAt))}<br>${escapeHtml(shift.location)} · ${escapeHtml(shift.role)}</li>`).join('');
  const subject = `SCCNH shifts confirmed (${request.receipt.shifts.length})`;
  const text = `Hi ${request.receipt.firstName},\n\nYour SCCNH shifts are confirmed.\n\n${shiftText}\n\nBring your SCCNH shirt. Event shirts are provided at training.\n\nUF Hillel`;
  const html = `<p>Hi ${escapeHtml(request.receipt.firstName)},</p><p>Your SCCNH shifts are confirmed.</p><ul>${shiftHtml}</ul><p>Bring your SCCNH shirt. Event shirts are provided at training.</p><p>UF Hillel</p>`;
  return { subject, text, html };
}

function timeRange(startsAt, endsAt) {
  return `${clock(startsAt)}–${clock(endsAt)}`;
}

function clock(value) {
  const hour = Number(value.slice(11, 13));
  const minute = value.slice(14, 16);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
