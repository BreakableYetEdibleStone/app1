/**
 * Centralized API Client Engine
 * รองรับ Timeout, JSON Handling และ Error Message ภาษาไทย
 */
const ApiClient = {
  async get(action, params = {}) {
    const url = new URL(APP_CONFIG.API_URL);
    url.searchParams.append('action', action);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล');
      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
      }
      throw err;
    }
  },

  async post(action, data = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.REQUEST_TIMEOUT);

    const payload = { action, ...data };

    try {
      // ใช้ Content-Type text/plain เพื่อป้องกัน CORS Preflight (OPTIONS) Issue ใน Google Apps Script Web App
      const response = await fetch(APP_CONFIG.API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('การส่งข้อมูลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
      }
      throw err;
    }
  }
};